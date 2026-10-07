import { supabaseAdmin } from '../services/supabase.js';
import { runAdjudicationAgent } from '../services/geminiService.js';
import { computeAdjudication } from '../services/adjudicationMath.js';
import { claimSubmissionSchema, uuidParamSchema } from '../validation/schemas.js';
import { HttpError } from '../utils/http.js';

const CLAIM_LIST_COLUMNS =
  'id, patient_id, policy_id, diagnosis_code, total_billed, status, approved_amount, created_at, policies(policy_number)';

const money = (n) =>
  Number(n ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

async function getOwnedClaim(claimId, userId) {
  const { data, error } = await supabaseAdmin
    .from('claims')
    .select('*, policies(*)')
    .eq('id', claimId)
    .eq('hospital_user_id', userId) // service role bypasses RLS → scope manually
    .maybeSingle();

  if (error) throw new HttpError(500, `Database error: ${error.message}`);
  if (!data) throw new HttpError(404, 'Claim not found.');
  return data;
}

/** POST /api/claims */
export async function createClaim(req, res) {
  const body = claimSubmissionSchema.parse(req.body);

  const { data: policy, error: policyErr } = await supabaseAdmin
    .from('policies')
    .select('id, patient_id, policy_number')
    .eq('id', body.policy_id)
    .maybeSingle();

  if (policyErr) throw new HttpError(500, `Database error: ${policyErr.message}`);
  if (!policy) throw new HttpError(400, 'Referenced policy does not exist.', [{ path: 'policy_id', message: 'Unknown policy' }]);

  const { data, error } = await supabaseAdmin
    .from('claims')
    .insert({
      hospital_user_id: req.user.id, // from verified JWT, never from body
      policy_id: body.policy_id,
      patient_id: body.patient_id,
      diagnosis_code: body.diagnosis_code,
      raw_bill_data: body.raw_bill_data,
      total_billed: body.total_billed,
      status: 'PENDING',
    })
    .select(CLAIM_LIST_COLUMNS)
    .single();

  if (error) throw new HttpError(500, `Failed to create claim: ${error.message}`);
  res.status(201).json({ claim: data });
}

/** GET /api/claims */
export async function listClaims(req, res) {
  const { data, error } = await supabaseAdmin
    .from('claims')
    .select(CLAIM_LIST_COLUMNS)
    .eq('hospital_user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) throw new HttpError(500, `Database error: ${error.message}`);
  res.json({ claims: data });
}

/** GET /api/claims/:id */
export async function getClaim(req, res) {
  const { id } = uuidParamSchema.parse(req.params);
  const claim = await getOwnedClaim(id, req.user.id);
  res.json({ claim });
}

/** POST /api/claims/:id/process — the agentic adjudication route */
export async function processClaim(req, res) {
  const { id } = uuidParamSchema.parse(req.params);
  const startedAt = Date.now();

  const claim = await getOwnedClaim(id, req.user.id);
  const policy = claim.policies;
  if (!policy) throw new HttpError(422, 'Claim has no associated policy; cannot adjudicate.');

  const billItems = Array.isArray(claim.raw_bill_data) ? claim.raw_bill_data : [];
  if (billItems.length === 0) throw new HttpError(422, 'Claim has no bill line items.');

  // 1. Autonomous reasoning by Gemini
  const { result, model, attempts } = await runAdjudicationAgent(claim, policy);

  // 2. Deterministic verification of the payout math
  const verified = computeAdjudication({
    billItems,
    totalBilled: claim.total_billed,
    policy,
    deniedItems: result.denied_items,
    patientId: claim.patient_id,
  });

  const aiAmount = Math.round(result.approved_amount * 100) / 100;
  const mathMatches = Math.abs(aiAmount - verified.approved_amount) < 0.01;
  const statusMatches = result.final_status === verified.status;

  const systemPreamble = [
    `[SYS] Agent session opened for claim ${claim.id.slice(0, 8)}…`,
    `[SYS] Loaded ${billItems.length} bill line items · total ${money(claim.total_billed)}`,
    `[SYS] Policy ${policy.policy_number} retrieved from Supabase · limit ${money(policy.max_coverage_limit)} · copay ${Number(policy.copay_percentage)}%`,
    `[SYS] Dispatching to ${model}…`,
  ];

  const verifierLines = [
    `[VERIFIER] Re-computing payout deterministically from agent's line-item decisions…`,
    ...(verified.patient_mismatch
      ? [`[VERIFIER] WARNING: patient ${claim.patient_id} is not policy holder ${policy.patient_id}; all line items denied`]
      : []),
    `[VERIFIER] ${money(verified.breakdown.total_billed)} − ${money(verified.breakdown.excluded_total)} excluded = ${money(verified.breakdown.eligible_amount)} eligible`,
    `[VERIFIER] Copay ${verified.breakdown.copay_percentage}% = ${money(verified.breakdown.copay_amount)} → payable ${money(verified.breakdown.payable_before_cap)}`,
    ...(verified.breakdown.cap_applied
      ? [`[VERIFIER] Max coverage cap applied: reduced by ${money(verified.breakdown.cap_reduction)}`]
      : []),
    ...(verified.unmatched_denied_items.length
      ? [`[VERIFIER] WARNING: ${verified.unmatched_denied_items.length} denied item(s) could not be matched to bill lines and were ignored`]
      : []),
    mathMatches && statusMatches
      ? `[VERIFIER] ✓ Agent math confirmed: ${money(verified.approved_amount)} (${verified.status})`
      : `[VERIFIER] ⚠ Agent reported ${money(aiAmount)} (${result.final_status}); corrected to ${money(verified.approved_amount)} (${verified.status})`,
    `[SYS] Adjudication complete in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
  ];

  const reasoningLog = {
    chain_of_thought: [...systemPreamble, ...result.chain_of_thought, ...verifierLines],
    agent_chain_of_thought: result.chain_of_thought,
    denied_items: verified.denied_items,
    unmatched_denied_items: verified.unmatched_denied_items,
    breakdown: verified.breakdown,
    ai_reported: { final_status: result.final_status, approved_amount: aiAmount },
    verification: { math_matches: mathMatches, status_matches: statusMatches },
    model,
    attempts,
    duration_ms: Date.now() - startedAt,
    processed_at: new Date().toISOString(),
  };

  const { data: updated, error } = await supabaseAdmin
    .from('claims')
    .update({
      status: verified.status,
      approved_amount: verified.approved_amount,
      ai_reasoning_log: reasoningLog,
    })
    .eq('id', claim.id)
    .eq('hospital_user_id', req.user.id)
    .select('*, policies(*)')
    .single();

  if (error) throw new HttpError(500, `Failed to save adjudication: ${error.message}`);
  res.json({ claim: updated });
}

/** GET /api/policies — for the claim submission form */
export async function listPolicies(_req, res) {
  const { data, error } = await supabaseAdmin
    .from('policies')
    .select('id, patient_id, policy_number, max_coverage_limit, copay_percentage, covered_treatments, excluded_treatments')
    .order('policy_number');

  if (error) throw new HttpError(500, `Database error: ${error.message}`);
  res.json({ policies: data });
}
