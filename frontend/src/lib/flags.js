/**
 * The flag the agent puts on every bill line (see backend/services/adjudicationMath.js).
 * `suspicious` flags point at a possible billing problem; NOT_COVERED is a
 * genuine charge the policy does not pay for.
 */
export const FLAGS = {
  OK: {
    label: 'OK',
    chip: 'bg-emerald-400/10 text-emerald-300',
    meaning: 'Covered by the policy and fairly charged.',
  },
  NOT_COVERED: {
    label: 'Not covered',
    chip: 'bg-amber-400/10 text-amber-300',
    meaning: 'A genuine charge, but the policy does not pay for it.',
  },
  DUPLICATE: {
    label: 'Duplicate',
    chip: 'bg-rose-400/10 text-rose-300',
    meaning: 'The same item appears to be billed more than once.',
    suspicious: true,
  },
  OVERPRICED: {
    label: 'Overpriced',
    chip: 'bg-rose-400/10 text-rose-300',
    meaning: 'The amount is far above the reference price for this service.',
    suspicious: true,
  },
  UNBUNDLED: {
    label: 'Unbundled',
    chip: 'bg-rose-400/10 text-rose-300',
    meaning: 'Normally included in a procedure already on the bill, but charged separately.',
    suspicious: true,
  },
  UNRELATED: {
    label: 'Unrelated',
    chip: 'bg-rose-400/10 text-rose-300',
    meaning: 'Does not appear to be connected to the diagnosis.',
    suspicious: true,
  },
};

export const flagMeta = (flag) => FLAGS[flag] ?? FLAGS.OK;
export const isSuspicious = (flag) => Boolean(FLAGS[flag]?.suspicious);

/**
 * Per-line results of a processed claim. Claims adjudicated before flags
 * existed only recorded denied items, with no flag; those read as NOT_COVERED.
 */
export function lineItemsOf(claim) {
  const log = claim?.ai_reasoning_log;
  if (!log) return [];
  if (log.line_items?.length) return log.line_items;

  const denied = new Map((log.denied_items ?? []).map((d) => [d.line, d]));
  return (claim.raw_bill_data ?? []).map((it, i) => {
    const d = denied.get(i + 1);
    return { line: i + 1, item_name: it.item_name, cost: it.cost, flag: d ? 'NOT_COVERED' : 'OK', reason: d?.reason ?? '' };
  });
}
