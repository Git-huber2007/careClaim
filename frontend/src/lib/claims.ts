import type { TerminalEvent } from '../components/AgentTerminal';

/**
 * The backend stores an adjudication as one `ai_reasoning_log` object:
 *   { chain_of_thought: string[], line_items: [...], breakdown: {...}, ... }
 * These helpers turn it into the shapes the UI components take.
 */

export function toTerminalEvents(log: any): TerminalEvent[] {
  return (log?.chain_of_thought ?? []).map((message: string) => ({ event: 'log', data: { message } }));
}

export function toPayoutBreakdown(log: any) {
  const b = log?.breakdown;
  if (!b) return null;
  return {
    billed: Number(b.total_billed),
    exclusions: Number(b.excluded_total),
    copay_amount: Number(b.copay_amount),
    limit_reduction: Number(b.cap_reduction),
    payout: Number(b.approved_amount)
  };
}

export interface LineDecision {
  line: number;
  item_name: string;
  cost: number;
  flag: string;
  reason: string;
}

// Flags that point at a possible billing problem; NOT_COVERED is a genuine
// charge the policy simply does not pay for.
const SUSPICIOUS = ['DUPLICATE', 'OVERPRICED', 'UNBUNDLED', 'UNRELATED'];

export const isSuspicious = (flag: string) => SUSPICIOUS.includes(flag);
export const flagLabel = (flag: string) => flag.replace('_', ' ');

/** The bill lines the agent did not pass as OK. */
export function flaggedLines(log: any): LineDecision[] {
  if (log?.line_items?.length) return log.line_items.filter((l: LineDecision) => l.flag !== 'OK');
  // Claims adjudicated before per-line flags existed only recorded denied items.
  return (log?.denied_items ?? []).map((d: any) => ({ ...d, flag: d.flag ?? 'NOT_COVERED' }));
}

/** One bill row of the intake form → the { item_name, cost } line the backend stores. */
export function toBillLine(item: { item_name: string; cost: number; quantity: number }) {
  const quantity = Math.max(1, Math.floor(item.quantity) || 1);
  const name = item.item_name.trim();
  return {
    item_name: quantity > 1 ? `${name} (x${quantity})` : name,
    cost: Math.round(item.cost * quantity * 100) / 100
  };
}
