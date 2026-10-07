/**
 * Deterministic adjudication math.
 *
 * Gemini decides WHICH items are denied (the reasoning). This module then
 * recomputes the payout from those decisions so the final number is always
 * arithmetically correct and auditable:
 *
 *   eligible   = total_billed - excluded_total
 *   copay      = eligible * copay_percentage / 100
 *   payable    = eligible - copay
 *   approved   = min(payable, max_coverage_limit)
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Map AI denied items back to concrete bill lines (handles duplicates by
 * consuming each bill line at most once).
 */
export function matchDeniedItems(billItems, deniedItems) {
  const used = new Set();
  const matched = [];
  const unmatched = [];

  for (const denied of deniedItems) {
    const target = norm(denied.item_name);
    let idx = billItems.findIndex((b, i) => !used.has(i) && norm(b.item_name) === target);
    if (idx === -1) {
      idx = billItems.findIndex(
        (b, i) => !used.has(i) && (norm(b.item_name).includes(target) || target.includes(norm(b.item_name)))
      );
    }
    if (idx === -1) {
      unmatched.push(denied);
      continue;
    }
    used.add(idx);
    matched.push({
      line: idx + 1,
      item_name: billItems[idx].item_name,
      cost: round2(billItems[idx].cost),
      reason: denied.reason,
    });
  }

  return { matched, unmatched };
}

export function computeAdjudication({ billItems, totalBilled, policy, deniedItems }) {
  const { matched, unmatched } = matchDeniedItems(billItems, deniedItems);

  const total = round2(totalBilled);
  const excludedTotal = round2(matched.reduce((s, m) => s + m.cost, 0));
  const eligible = round2(Math.max(0, total - excludedTotal));
  const copayPct = Number(policy.copay_percentage);
  const copayAmount = round2((eligible * copayPct) / 100);
  const payable = round2(eligible - copayAmount);
  const maxLimit = round2(policy.max_coverage_limit);
  const capped = payable > maxLimit;
  const approved = round2(Math.min(payable, maxLimit));
  const capReduction = capped ? round2(payable - maxLimit) : 0;

  let status;
  if (approved <= 0) status = 'DENIED';
  else if (matched.length === 0 && !capped) status = 'APPROVED';
  else status = 'PARTIAL';

  return {
    status,
    approved_amount: approved,
    breakdown: {
      total_billed: total,
      excluded_total: excludedTotal,
      eligible_amount: eligible,
      copay_percentage: copayPct,
      copay_amount: copayAmount,
      payable_before_cap: payable,
      max_coverage_limit: maxLimit,
      cap_applied: capped,
      cap_reduction: capReduction,
      approved_amount: approved,
    },
    denied_items: matched,
    unmatched_denied_items: unmatched,
  };
}
