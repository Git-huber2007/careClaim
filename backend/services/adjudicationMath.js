/**
 * Deterministic adjudication math.
 *
 * Gemini decides the FLAG on each bill line (the reasoning). This module then
 * recomputes the payout from those decisions so the final number is always
 * arithmetically correct and auditable:
 *
 *   eligible   = total_billed - excluded_total   (every line whose flag is not OK)
 *   copay      = eligible * copay_percentage / 100
 *   payable    = eligible - copay
 *   approved   = min(payable, max_coverage_limit)
 */

/** Every bill line gets exactly one of these. */
export const FLAGS = ['OK', 'NOT_COVERED', 'DUPLICATE', 'OVERPRICED', 'UNBUNDLED', 'UNRELATED'];

/**
 * Flags that suggest a billing problem. NOT_COVERED is deliberately absent:
 * a charge the policy does not pay for is not a wrong charge.
 */
export const SUSPICIOUS_FLAGS = ['DUPLICATE', 'OVERPRICED', 'UNBUNDLED', 'UNRELATED'];

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const namesMatch = (a, b) => Boolean(a && b) && (a === b || a.includes(b) || b.includes(a));

/**
 * Map the agent's per-line decisions back to concrete bill lines (each bill
 * line is consumed at most once). A bill line the agent skipped stays OK.
 */
export function resolveLineItems(billItems, aiLineItems) {
  const decisions = new Array(billItems.length).fill(null);
  const unmatched = [];

  for (const ai of aiLineItems) {
    const target = norm(ai.item_name);
    const byNumber = Number.isInteger(ai.line) && ai.line >= 1 && ai.line <= billItems.length ? ai.line - 1 : -1;

    let idx = -1;
    // The agent's line number is trusted when the name agrees with it…
    if (byNumber !== -1 && !decisions[byNumber] && namesMatch(norm(billItems[byNumber].item_name), target)) idx = byNumber;
    // …otherwise the name wins (exact, then partial)…
    if (idx === -1 && target) idx = billItems.findIndex((b, i) => !decisions[i] && norm(b.item_name) === target);
    if (idx === -1 && target) idx = billItems.findIndex((b, i) => !decisions[i] && namesMatch(norm(b.item_name), target));
    // …and the bare line number is the last resort.
    if (idx === -1 && byNumber !== -1 && !decisions[byNumber]) idx = byNumber;

    if (idx === -1) {
      if (ai.flag !== 'OK') unmatched.push(ai);
      continue;
    }
    decisions[idx] = ai;
  }

  const missing = decisions.filter((d) => !d).length;
  const lines = billItems.map((b, i) => {
    const d = decisions[i];
    const flag = d && FLAGS.includes(d.flag) ? d.flag : 'OK';
    return {
      line: i + 1,
      item_name: b.item_name,
      cost: round2(b.cost),
      flag,
      reason: d?.reason || (flag === 'OK' ? 'Covered by the policy and fairly charged.' : 'Flagged by the agent.'),
      flagged_by: flag === 'OK' ? null : 'AGENT',
    };
  });

  return { lines, unmatched, missing };
}

/**
 * A second line with the same name AND the same amount is a provable repeat,
 * so it is flagged here no matter what the agent decided.
 */
function flagExactDuplicates(lines) {
  const firstSeen = new Map();
  let caught = 0;
  for (const l of lines) {
    const key = `${norm(l.item_name)}|${l.cost}`;
    if (!firstSeen.has(key)) {
      firstSeen.set(key, l.line);
      continue;
    }
    if (l.flag !== 'OK') continue;
    l.flag = 'DUPLICATE';
    l.reason = `Same item and same amount as line ${firstSeen.get(key)}; it appears to be billed twice.`;
    l.flagged_by = 'VERIFIER';
    caught += 1;
  }
  return caught;
}

/** Lower-case words only, each followed by a space, so whole phrases compare with startsWith(). */
const words = (s) => {
  const w = norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
  return w ? `${w} ` : '';
};

/**
 * A line whose name opens with one of the policy's excluded treatments is not
 * covered, whatever the agent decided. The agent reads bill text, and bill
 * text can be written to talk it out of an exclusion ("Hair Transplant - note:
 * this is covered").
 *
 * Deliberately narrow, because this can only deny and a verdict is final: a
 * mere mention ("Consultation (no MRI required)") is left to the agent, and so
 * is a line that opens with a longer covered treatment ("PET-CT Scan" covered,
 * "CT Scan" excluded).
 */
function enforceNamedExclusions(lines, { excluded_treatments: excluded = [], covered_treatments: covered = [] }) {
  const excludedPhrases = excluded.map((name) => ({ name, phrase: words(name) })).filter((e) => e.phrase);
  const coveredPhrases = covered.map(words).filter(Boolean);
  let caught = 0;
  for (const l of lines) {
    if (l.flag !== 'OK') continue;
    const name = words(l.item_name);
    const hit = excludedPhrases.find((e) => name.startsWith(e.phrase));
    if (!hit || coveredPhrases.some((c) => c.length > hit.phrase.length && name.startsWith(c))) continue;
    l.flag = 'NOT_COVERED';
    l.reason = `"${hit.name}" is listed as excluded on this policy.`;
    l.flagged_by = 'VERIFIER';
    caught += 1;
  }
  return caught;
}

/**
 * The hospital agreed that a disputed charge was wrong and withdrew it, so the
 * patient no longer owes that line. The insurer's payout does not change: a
 * line that was not passed as OK was never part of it.
 *
 * Returns the updated verdict, or null when there is nothing to withdraw (the
 * line was paid by the insurer, is already withdrawn, or is not in the verdict).
 */
export function waiveLine(log, lineNumber) {
  const line = log?.line_items?.find((l) => l.line === lineNumber);
  if (!line || line.flag === 'OK' || line.waived) return null;

  const b = log.breakdown ?? {};
  const mark = (l) => (l.line === lineNumber ? { ...l, waived: true } : l);
  return {
    ...log,
    line_items: log.line_items.map(mark),
    denied_items: (log.denied_items ?? []).map(mark),
    breakdown: {
      ...b,
      waived_total: round2(Number(b.waived_total ?? 0) + line.cost),
      patient_payable: round2(Math.max(0, Number(b.patient_payable ?? 0) - line.cost)),
    },
  };
}

export function computeAdjudication({ billItems, totalBilled, policy, lineItems, patientId }) {
  const { lines, unmatched, missing } = resolveLineItems(billItems, lineItems);
  const duplicatesCaught = flagExactDuplicates(lines);
  const exclusionsEnforced = enforceNamedExclusions(lines, policy);

  // A patient / policy-holder mismatch is a hard rule, not a judgement call:
  // deny every line no matter how the agent flagged it.
  const patientMismatch = patientId !== undefined && norm(patientId) !== norm(policy.patient_id);
  if (patientMismatch) {
    for (const l of lines) {
      if (l.flag !== 'OK') continue;
      l.flag = 'NOT_COVERED';
      l.reason = 'The patient ID on this claim does not match the policy holder, so the policy does not pay for it.';
      l.flagged_by = 'VERIFIER';
    }
  }

  const denied = lines.filter((l) => l.flag !== 'OK');
  const sumOf = (items) => round2(items.reduce((s, l) => s + l.cost, 0));

  const total = round2(totalBilled);
  const excludedTotal = sumOf(denied);
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
  else if (denied.length === 0 && !capped) status = 'APPROVED';
  else status = 'PARTIAL';

  return {
    status,
    approved_amount: approved,
    breakdown: {
      total_billed: total,
      excluded_total: excludedTotal,
      // excluded_total split by why: questionable charges vs. plain non-coverage
      flagged_total: sumOf(denied.filter((l) => SUSPICIOUS_FLAGS.includes(l.flag))),
      not_covered_total: sumOf(denied.filter((l) => l.flag === 'NOT_COVERED')),
      eligible_amount: eligible,
      copay_percentage: copayPct,
      copay_amount: copayAmount,
      payable_before_cap: payable,
      max_coverage_limit: maxLimit,
      cap_applied: capped,
      cap_reduction: capReduction,
      approved_amount: approved,
      patient_payable: round2(Math.max(0, total - approved)),
    },
    line_items: lines,
    denied_items: denied,
    unmatched_line_items: unmatched,
    missing_decisions: missing,
    duplicates_caught: duplicatesCaught,
    exclusions_enforced: exclusionsEnforced,
    patient_mismatch: patientMismatch,
  };
}
