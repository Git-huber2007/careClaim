import type { TerminalEvent } from '../components/AgentTerminal';
import { formatCurrency } from './format';

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

/**
 * The approved amount as shown on screen. Until a verdict is saved the stored
 * amount is only the column default of 0, which would read as a full denial.
 */
export function approvedDisplay(claim: any) {
  return claim.status === 'PENDING' ? '—' : formatCurrency(claim.approved_amount);
}

/** What the patient still owes on an adjudicated claim. */
export function patientPayable(claim: any) {
  return Number(
    claim.ai_reasoning_log?.breakdown?.patient_payable ??
      Math.max(0, Number(claim.total_billed) - Number(claim.approved_amount || 0))
  );
}

/** A bill line the patient has questioned, and the hospital's answer once given. */
export interface Dispute {
  id: string;
  claim_id: string;
  line_number: number;
  item_name: string;
  cost: number;
  flag: string | null;
  patient_note: string | null;
  status: 'OPEN' | 'ACCEPTED' | 'REJECTED';
  hospital_response: string | null;
  created_at: string;
  /** Only on the disputes list (GET /api/disputes), which spans claims. */
  patient_id?: string;
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
