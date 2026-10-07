import { describe, expect, it } from 'vitest';
import {
  approvedDisplay,
  flagLabel,
  flaggedLines,
  isSuspicious,
  patientPayable,
  toBillLine,
  toPayoutBreakdown,
  toTerminalEvents
} from './claims';
import { shortId } from './format';

describe('toBillLine', () => {
  it('passes a single-quantity row through, trimmed', () => {
    expect(toBillLine({ item_name: '  Anesthesia ', cost: 18000, quantity: 1 })).toEqual({ item_name: 'Anesthesia', cost: 18000 });
  });

  it('folds the quantity into the name and the cost', () => {
    expect(toBillLine({ item_name: 'Room Charges', cost: 7000.5, quantity: 3 })).toEqual({ item_name: 'Room Charges (x3)', cost: 21001.5 });
  });

  it('treats a missing, fractional or negative quantity as whole and at least one', () => {
    expect(toBillLine({ item_name: 'X-Ray', cost: 100, quantity: 0 }).cost).toBe(100);
    expect(toBillLine({ item_name: 'X-Ray', cost: 100, quantity: -4 }).cost).toBe(100);
    expect(toBillLine({ item_name: 'X-Ray', cost: 100, quantity: 2.9 })).toEqual({ item_name: 'X-Ray (x2)', cost: 200 });
  });
});

describe('flags', () => {
  it('separates billing problems from plain non-coverage', () => {
    expect(['DUPLICATE', 'OVERPRICED', 'UNBUNDLED', 'UNRELATED'].every(isSuspicious)).toBe(true);
    expect(isSuspicious('NOT_COVERED')).toBe(false);
    expect(isSuspicious('OK')).toBe(false);
  });

  it('labels a flag for display', () => {
    expect(flagLabel('NOT_COVERED')).toBe('NOT COVERED');
  });

  it('lists only the lines the agent did not pass', () => {
    const log = {
      line_items: [
        { line: 1, item_name: 'A', cost: 1, flag: 'OK', reason: '' },
        { line: 2, item_name: 'B', cost: 2, flag: 'DUPLICATE', reason: 'twice' }
      ]
    };
    expect(flaggedLines(log).map(l => l.line)).toEqual([2]);
  });

  it('reads a verdict saved before per-line flags existed as not covered', () => {
    const log = { denied_items: [{ line: 3, item_name: 'C', cost: 5, reason: 'excluded' }] };
    expect(flaggedLines(log)).toEqual([{ line: 3, item_name: 'C', cost: 5, reason: 'excluded', flag: 'NOT_COVERED' }]);
  });

  it('has nothing to list for a claim with no verdict', () => {
    expect(flaggedLines(null)).toEqual([]);
  });
});

describe('amounts', () => {
  it('shows a dash, not the stored zero, until a claim is decided', () => {
    expect(approvedDisplay({ status: 'PENDING', approved_amount: 0 })).toBe('—');
    expect(approvedDisplay({ status: 'PENDING', approved_amount: null })).toBe('—');
    expect(approvedDisplay({ status: 'PROCESSING', approved_amount: 0 })).toBe('—');
    expect(approvedDisplay({ status: 'PROCESSING', approved_amount: null })).toBe('—');
  });

  it('shows the amount once decided, including a real zero', () => {
    expect(approvedDisplay({ status: 'PARTIAL', approved_amount: 92700 })).toBe('₹92,700');
    expect(approvedDisplay({ status: 'DENIED', approved_amount: 0 })).toBe('₹0');
  });

  it('takes what the patient owes from the verdict, else from billed minus approved', () => {
    expect(patientPayable({ total_billed: 1000, approved_amount: 400, ai_reasoning_log: { breakdown: { patient_payable: 650 } } })).toBe(650);
    expect(patientPayable({ total_billed: 1000, approved_amount: 400 })).toBe(600);
    expect(patientPayable({ total_billed: 1000, approved_amount: null })).toBe(1000);
  });

  it('maps the saved breakdown onto the waterfall, or nothing without one', () => {
    expect(toPayoutBreakdown(null)).toBeNull();
    expect(
      toPayoutBreakdown({ breakdown: { total_billed: '198000', excluded_total: 95000, copay_amount: 10300, cap_reduction: 0, approved_amount: 92700 } })
    ).toEqual({ billed: 198000, exclusions: 95000, copay_amount: 10300, limit_reduction: 0, payout: 92700 });
  });
});

describe('display helpers', () => {
  it('turns a saved reasoning log into terminal lines', () => {
    expect(toTerminalEvents({ chain_of_thought: ['one', 'two'] })).toEqual([
      { event: 'log', data: { message: 'one' } },
      { event: 'log', data: { message: 'two' } }
    ]);
    expect(toTerminalEvents(null)).toEqual([]);
  });

  it('shortens a claim ID to its first block', () => {
    expect(shortId('eaf52ac8-ac59-4fe0-bfbd-e830d1dbe51e')).toBe('eaf52ac8');
  });
});
