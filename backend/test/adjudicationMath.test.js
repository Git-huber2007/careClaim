import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAdjudication, resolveLineItems } from '../services/adjudicationMath.js';

describe('Adjudication Math Engine', () => {
  it('correctly calculates clean approved claims with copay', () => {
    const res = computeAdjudication({
      billItems: [
        { item_name: 'Consultation', cost: 1000 },
        { item_name: 'Diagnostic Blood Panel', cost: 2000 },
      ],
      totalBilled: 3000,
      policy: {
        patient_id: 'PAT-001',
        copay_percentage: 10,
        max_coverage_limit: 50000,
      },
      lineItems: [
        { line: 1, item_name: 'Consultation', flag: 'OK' },
        { line: 2, item_name: 'Diagnostic Blood Panel', flag: 'OK' },
      ],
      patientId: 'PAT-001',
    });

    assert.equal(res.status, 'APPROVED');
    assert.equal(res.approved_amount, 2700);
    assert.equal(res.breakdown.copay_amount, 300);
    assert.equal(res.breakdown.patient_payable, 300);
  });

  it('correctly deducts excluded and fraudulent items', () => {
    const res = computeAdjudication({
      billItems: [
        { item_name: 'Laparoscopic Appendectomy', cost: 80000 },
        { item_name: 'Cosmetic Scar Revision Surgery', cost: 20000 },
        { item_name: 'Duplicate Dressing Fee', cost: 5000 },
      ],
      totalBilled: 105000,
      policy: {
        patient_id: 'PAT-002',
        copay_percentage: 10,
        max_coverage_limit: 150000,
      },
      lineItems: [
        { line: 1, item_name: 'Laparoscopic Appendectomy', flag: 'OK' },
        { line: 2, item_name: 'Cosmetic Scar Revision Surgery', flag: 'NOT_COVERED', reason: 'Cosmetic' },
        { line: 3, item_name: 'Duplicate Dressing Fee', flag: 'DUPLICATE', reason: 'Duplicate' },
      ],
      patientId: 'PAT-002',
    });

    assert.equal(res.status, 'PARTIAL');
    assert.equal(res.breakdown.eligible_amount, 80000);
    assert.equal(res.breakdown.copay_amount, 8000);
    assert.equal(res.approved_amount, 72000);
    assert.equal(res.denied_items.length, 2);
  });

  it('flags exact duplicates deterministically even if AI missed them', () => {
    const res = computeAdjudication({
      billItems: [
        { item_name: 'Chest X-Ray', cost: 1500 },
        { item_name: 'Chest X-Ray', cost: 1500 },
      ],
      totalBilled: 3000,
      policy: {
        patient_id: 'PAT-003',
        copay_percentage: 0,
        max_coverage_limit: 10000,
      },
      lineItems: [
        { line: 1, item_name: 'Chest X-Ray', flag: 'OK' },
        { line: 2, item_name: 'Chest X-Ray', flag: 'OK' },
      ],
      patientId: 'PAT-003',
    });

    assert.equal(res.duplicates_caught, 1);
    assert.equal(res.approved_amount, 1500);
    assert.equal(res.line_items[1].flag, 'DUPLICATE');
  });

  it('denies all lines when patient ID does not match policy holder', () => {
    const res = computeAdjudication({
      billItems: [{ item_name: 'General Consultation', cost: 1000 }],
      totalBilled: 1000,
      policy: {
        patient_id: 'PAT-HOLDER',
        copay_percentage: 0,
        max_coverage_limit: 10000,
      },
      lineItems: [{ line: 1, item_name: 'General Consultation', flag: 'OK' }],
      patientId: 'PAT-DIFFERENT',
    });

    assert.equal(res.status, 'DENIED');
    assert.equal(res.approved_amount, 0);
    assert.equal(res.patient_mismatch, true);
  });

  it('caps payout at max_coverage_limit', () => {
    const res = computeAdjudication({
      billItems: [{ item_name: 'Cardiac Surgery', cost: 300000 }],
      totalBilled: 300000,
      policy: {
        patient_id: 'PAT-004',
        copay_percentage: 0,
        max_coverage_limit: 200000,
      },
      lineItems: [{ line: 1, item_name: 'Cardiac Surgery', flag: 'OK' }],
      patientId: 'PAT-004',
    });

    assert.equal(res.status, 'PARTIAL');
    assert.equal(res.breakdown.cap_applied, true);
    assert.equal(res.approved_amount, 200000);
    assert.equal(res.breakdown.cap_reduction, 100000);
  });
});
