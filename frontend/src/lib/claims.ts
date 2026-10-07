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
  /** The hospital withdrew this charge after the patient disputed it. */
  waived?: boolean;
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
  return claim.status === 'PENDING' || claim.status === 'PROCESSING' ? '—' : formatCurrency(claim.approved_amount);
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

/** One row of the rate card the overcharge check compares against (GET /api/reference-prices). */
export interface ReferencePrice {
  item_name: string;
  typical_max_price: number;
  unit: string;
}

/** Lower-case words with a space on each side, so a whole phrase can be found with includes(). */
const phrase = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/**
 * The rate-card entry for a bill line, or null when the card has none.
 * "Lab Tests / Blood Work" matches either name; of several matches the longest
 * wins ("PET-CT Scan" over "CT Scan"). A per-day price is multiplied by the
 * days the line states, and any price by a "(x3)" quantity.
 */
export function findReferencePrice(itemName: string, prices: ReferencePrice[]) {
  const item = phrase(itemName);
  let best: { price: ReferencePrice; length: number } | null = null;
  for (const price of prices) {
    for (const name of price.item_name.split('/')) {
      const wanted = phrase(name.replace(/\(.*?\)/g, ''));
      if (wanted.trim() && item.includes(wanted) && wanted.length > (best?.length ?? 0)) best = { price, length: wanted.length };
    }
  }
  if (!best) return null;

  const days = /per day/i.test(best.price.unit) ? Number(/(\d+)\s*(?:days?|nights?)/i.exec(itemName)?.[1]) : NaN;
  const quantity = Number(/\(x(\d+)\)\s*$/i.exec(itemName)?.[1]);
  const multiplier = days > 0 ? days : quantity > 0 ? quantity : 1;
  return {
    name: best.price.item_name,
    unit: best.price.unit,
    unitPrice: Number(best.price.typical_max_price),
    multiplier,
    reference: Number(best.price.typical_max_price) * multiplier
  };
}

/** Rows → CSV text. Cells are quoted, and one a spreadsheet would run as a formula is made plain text. */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const cell = (value: string | number | null | undefined) => {
    const text = String(value ?? '');
    return `"${(/^[=+\-@]/.test(text) && typeof value !== 'number' ? `'${text}` : text).replace(/"/g, '""')}"`;
  };
  return rows.map(row => row.map(cell).join(',')).join('\r\n');
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
