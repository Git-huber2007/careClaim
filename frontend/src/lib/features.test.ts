import { describe, expect, it } from 'vitest';
import { findReferencePrice, toCsv } from './claims';
import type { ReferencePrice } from './claims';
import { LANGUAGES, explainVerdict } from './explain';
import { describeIcd10, looksLikeIcd10 } from './icd10';

const PRICES: ReferencePrice[] = [
  { item_name: 'Room Charges', typical_max_price: 10000, unit: 'per day' },
  { item_name: 'CT Scan', typical_max_price: 18000, unit: 'per scan' },
  { item_name: 'PET-CT Scan', typical_max_price: 35000, unit: 'per scan' },
  { item_name: 'X-Ray', typical_max_price: 8000, unit: 'per scan' },
  { item_name: 'Lab Tests / Blood Work', typical_max_price: 12000, unit: 'per admission' },
  { item_name: 'High Dependency Unit (HDU)', typical_max_price: 30000, unit: 'per day' }
];

describe('findReferencePrice', () => {
  it('finds the rate-card entry named inside a bill line', () => {
    expect(findReferencePrice('Abdominal X-Ray', PRICES)).toMatchObject({ name: 'X-Ray', reference: 8000, multiplier: 1 });
    expect(findReferencePrice('Chest x ray digital', PRICES)?.name).toBe('X-Ray');
  });

  it('prefers the longer of two matching names', () => {
    expect(findReferencePrice('PET-CT Scan Whole Body', PRICES)?.name).toBe('PET-CT Scan');
    expect(findReferencePrice('CT Scan Abdomen', PRICES)?.name).toBe('CT Scan');
  });

  it('matches either name of an entry that lists two, and ignores a bracketed abbreviation', () => {
    expect(findReferencePrice('Pre-Op Blood Work', PRICES)?.name).toBe('Lab Tests / Blood Work');
    expect(findReferencePrice('High Dependency Unit - 2 days', PRICES)).toMatchObject({ multiplier: 2, reference: 60000 });
  });

  it('multiplies a per-day price by the stated days, and any price by an (xN) quantity', () => {
    expect(findReferencePrice('Room Charges (4 days)', PRICES)).toMatchObject({ unitPrice: 10000, multiplier: 4, reference: 40000 });
    expect(findReferencePrice('X-Ray (x3)', PRICES)).toMatchObject({ multiplier: 3, reference: 24000 });
    expect(findReferencePrice('CT Scan after 2 days', PRICES)).toMatchObject({ multiplier: 1 });
  });

  it('matches whole words only, and answers null when the card has no entry', () => {
    expect(findReferencePrice('Mushroom Charges', PRICES)).toBeNull();
    expect(findReferencePrice('Pulmonology Consultation', PRICES)).toBeNull();
    expect(findReferencePrice('Anything', [])).toBeNull();
  });
});

describe('toCsv', () => {
  it('quotes every cell and doubles quotes inside one', () => {
    expect(toCsv([['a', 'b "c"'], [1, null]])).toBe('"a","b ""c"""\r\n"1",""');
  });

  it('keeps commas and line breaks inside their cell', () => {
    expect(toCsv([['x, y', 'two\nlines']])).toBe('"x, y","two\nlines"');
  });

  it('stops a text cell from being run as a formula, but leaves negative numbers alone', () => {
    expect(toCsv([['=SUM(A1)', '-5 units', -5]])).toBe('"\'=SUM(A1)","\'-5 units","-5"');
  });
});

describe('explainVerdict', () => {
  const claim = {
    status: 'PARTIAL',
    total_billed: 100000,
    approved_amount: 45000,
    ai_reasoning_log: {
      line_items: [
        { line: 1, item_name: 'Surgery', cost: 50000, flag: 'OK', reason: '' },
        { line: 2, item_name: 'Anesthesia', cost: 20000, flag: 'DUPLICATE', reason: 'model wording that must not be shown' },
        { line: 3, item_name: 'Scar Revision', cost: 30000, flag: 'NOT_COVERED', reason: 'x', waived: true }
      ],
      breakdown: { copay_amount: 5000, cap_reduction: 0, patient_payable: 25000, waived_total: 30000 }
    }
  };

  it('has nothing to say before there is a verdict', () => {
    expect(explainVerdict({ status: 'PENDING', total_billed: 1 }, 'en', true)).toBeNull();
    expect(explainVerdict({ status: 'PROCESSING', total_billed: 1, ai_reasoning_log: {} }, 'en', true)).toBeNull();
  });

  it('states the three amounts and lists each unpaid charge by what its flag means', () => {
    const e = explainVerdict(claim, 'en', true)!;
    expect(e.summary.slice(0, 3)).toEqual(['The bill was ₹1,00,000.', 'The insurer pays ₹45,000.', 'You pay ₹25,000.']);
    expect(e.summary[3]).toBe('The insurer did not pay for 2 charges, worth ₹50,000:');
    expect(e.charges).toEqual([
      'Anesthesia (₹20,000): It looks like it was billed twice.',
      'Scar Revision (₹30,000): The policy does not pay for this. Withdrawn by the hospital.'
    ]);
    expect(JSON.stringify(e)).not.toContain('model wording');
  });

  it('explains the copay and the withdrawn charge, and tells a patient they can ask the hospital', () => {
    const notes = explainVerdict(claim, 'en', true)!.notes;
    expect(notes).toHaveLength(3);
    expect(notes[0]).toContain('₹5,000');
    expect(notes[1]).toContain('₹30,000');
    expect(notes[2]).toContain('ask the hospital');
  });

  it('addresses the hospital in the third person and gives it no advice to ask itself', () => {
    const e = explainVerdict(claim, 'en', false)!;
    expect(e.summary[2]).toBe('The patient pays ₹25,000.');
    expect(e.notes).toHaveLength(2);
  });

  it('says so when every charge was accepted', () => {
    const clean = { status: 'APPROVED', total_billed: 1000, approved_amount: 900, ai_reasoning_log: { line_items: [], breakdown: { copay_amount: 100, patient_payable: 100 } } };
    const e = explainVerdict(clean, 'en', true)!;
    expect(e.summary.at(-1)).toBe('Every charge on the bill was accepted.');
    expect(e.charges).toEqual([]);
  });

  it('gives the same content in Hindi', () => {
    const e = explainVerdict(claim, 'hi', true)!;
    expect(e.summary[0]).toBe('कुल बिल ₹1,00,000 था।');
    expect(e.charges).toHaveLength(2);
    expect(e.charges[0]).toContain('दो बार');
    expect(e.notes).toHaveLength(3);
    // Only the item names, which come from the bill, stay as written.
    expect([...e.summary, ...e.notes].join(' ')).not.toMatch(/[A-Za-z]/);
  });

  it('gives the same content in every other language, with no English left in it', () => {
    for (const { id } of LANGUAGES.filter(l => l.id !== 'en')) {
      const e = explainVerdict(claim, id, true)!;
      expect(e.summary, id).toHaveLength(4);
      expect(e.summary[0], id).toContain('₹1,00,000');
      expect(e.summary[3], id).toContain('₹50,000');
      expect(e.charges, id).toHaveLength(2);
      expect(e.charges[1], id).toContain('Scar Revision');
      expect(e.notes, id).toHaveLength(3);
      expect([...e.summary, ...e.notes].join(' '), id).not.toMatch(/[A-Za-z]/);
      // Each language says it in its own words, not in another's.
      expect(e.summary[0], id).not.toBe(explainVerdict(claim, id === 'hi' ? 'mr' : 'hi', true)!.summary[0]);
    }
  });
});

describe('ICD-10 helpers', () => {
  it('recognises the shape of a code, in either case', () => {
    expect(['K35.80', 'j18.9', 'I10', 'S72.001A', ' O80 '].every(looksLikeIcd10)).toBe(true);
    expect(['appendicitis', '35.80', 'K3', 'K35.', 'K35.80000'].some(looksLikeIcd10)).toBe(false);
  });

  it('describes a code on the list and nothing else', () => {
    expect(describeIcd10('k35.80')).toBe('Acute appendicitis, unspecified');
    expect(describeIcd10('Z99.99')).toBeNull();
    expect(describeIcd10('')).toBeNull();
  });
});
