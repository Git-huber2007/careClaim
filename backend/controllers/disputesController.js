import { supabaseAdmin } from '../services/supabase.js';
import { getAccessibleClaim, quoted } from './claimsController.js';
import { waiveLine } from '../services/adjudicationMath.js';
import { disputeResponseSchema, disputeSubmissionSchema, uuidParamSchema } from '../validation/schemas.js';
import { HttpError, dbError } from '../utils/http.js';

const DISPUTE_COLUMNS =
  'id, claim_id, line_number, item_name, cost, flag, patient_note, status, hospital_response, created_at, responded_at';

/** POST /api/claims/:id/disputes — a patient questions one line of a hospital-filed bill */
export async function createDispute(req, res) {
  const { id } = uuidParamSchema.parse(req.params);
  const body = disputeSubmissionSchema.parse(req.body);

  const claim = await getAccessibleClaim(id, req);
  if (claim.source !== 'HOSPITAL') {
    throw new HttpError(422, 'This bill was checked by you, so no hospital account is attached to receive a dispute.');
  }
  if (!claim.ai_reasoning_log) throw new HttpError(422, 'This claim has not been adjudicated yet.');

  const billItems = Array.isArray(claim.raw_bill_data) ? claim.raw_bill_data : [];
  const item = billItems[body.line_number - 1];
  if (!item) throw new HttpError(400, 'That line is not on the bill.', [{ path: 'line_number', message: 'Unknown bill line' }]);

  const flagged = claim.ai_reasoning_log.line_items?.find((l) => l.line === body.line_number);

  const { data, error } = await supabaseAdmin
    .from('disputes')
    .insert({
      claim_id: claim.id,
      patient_user_id: req.user.id,
      line_number: body.line_number,
      item_name: item.item_name,
      cost: item.cost,
      flag: flagged?.flag ?? null,
      patient_note: body.note || null,
    })
    .select(DISPUTE_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') throw new HttpError(409, 'This line has already been disputed.');
    throw new HttpError(500, `Failed to raise dispute: ${error.message}`);
  }
  res.status(201).json({ dispute: data });
}

/** GET /api/disputes — a patient's own disputes, or those raised on a hospital's claims */
export async function listDisputes(req, res) {
  let query = supabaseAdmin
    .from('disputes')
    .select(`${DISPUTE_COLUMNS}, claims!inner(patient_id, diagnosis_code, hospital_user_id, hospital_org)`);

  const org = req.profile.hospital_org;
  if (req.profile.role === 'PATIENT') {
    query = query.eq('patient_user_id', req.user.id);
  } else if (org) {
    query = query.or(`hospital_org.eq.${quoted(org)},hospital_user_id.eq.${req.user.id}`, { foreignTable: 'claims' });
  } else {
    query = query.eq('claims.hospital_user_id', req.user.id);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw dbError(error);
  res.json({
    disputes: data.map(({ claims, ...d }) => ({ ...d, patient_id: claims.patient_id, diagnosis_code: claims.diagnosis_code })),
  });
}

/**
 * Brings a claim's verdict in line with its accepted disputes: every line the
 * hospital agreed to correct is taken off what the patient owes. It works from
 * all of the claim's accepted disputes, not only the one just answered, so a
 * withdrawal that was lost (a failed save, two answers racing on two servers)
 * is made good the next time one is accepted. Answers with the verdict.
 */
async function applyAcceptedDisputes(claimId) {
  const [{ data: claim, error }, { data: accepted, error: listErr }] = await Promise.all([
    supabaseAdmin.from('claims').select('ai_reasoning_log').eq('id', claimId).maybeSingle(),
    supabaseAdmin.from('disputes').select('line_number').eq('claim_id', claimId).eq('status', 'ACCEPTED'),
  ]);
  if (error || listErr) throw new Error((error || listErr).message);

  let log = claim?.ai_reasoning_log;
  let changed = false;
  for (const { line_number } of accepted) {
    const next = waiveLine(log, line_number);
    if (next) {
      log = next;
      changed = true;
    }
  }
  if (changed) {
    const { error: saveErr } = await supabaseAdmin.from('claims').update({ ai_reasoning_log: log }).eq('id', claimId);
    if (saveErr) throw new Error(saveErr.message);
  }
  return log;
}

// The save above replaces the whole verdict object, so within this process the
// withdrawals for one claim run one after another, each reading what the last wrote.
const withdrawalQueue = new Map();
function withdrawAcceptedCharges(claimId) {
  const run = (withdrawalQueue.get(claimId) ?? Promise.resolve()).then(() => applyAcceptedDisputes(claimId));
  const tail = run
    .catch(() => {})
    .finally(() => {
      if (withdrawalQueue.get(claimId) === tail) withdrawalQueue.delete(claimId);
    });
  withdrawalQueue.set(claimId, tail);
  return run;
}

/** POST /api/disputes/:id/respond — the hospital that filed the claim answers */
export async function respondToDispute(req, res) {
  const { id } = uuidParamSchema.parse(req.params);
  const body = disputeResponseSchema.parse(req.body);

  const { data: dispute, error: findErr } = await supabaseAdmin
    .from('disputes')
    .select('id, status, claims!inner(hospital_user_id, hospital_org)')
    .eq('id', id)
    .maybeSingle();

  if (findErr) throw dbError(findErr);
  if (!dispute) throw new HttpError(404, 'Dispute not found.');

  const isAuthor = dispute.claims.hospital_user_id === req.user.id;
  const isOrgMember = req.profile.hospital_org && dispute.claims.hospital_org === req.profile.hospital_org;
  if (!isAuthor && !isOrgMember) {
    throw new HttpError(404, 'Dispute not found.');
  }
  if (dispute.status !== 'OPEN') throw new HttpError(409, 'This dispute has already been answered.');

  const { data, error } = await supabaseAdmin
    .from('disputes')
    .update({ status: body.status, hospital_response: body.response, responded_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'OPEN') // a second, concurrent answer changes nothing
    .select(DISPUTE_COLUMNS)
    .maybeSingle();

  if (error) throw new HttpError(500, `Failed to save response: ${error.message}`);
  if (!data) throw new HttpError(409, 'This dispute has already been answered.');

  // The answer is saved. Taking the charge off the bill is a second step, and
  // the caller is told whether it happened instead of the answer being undone.
  let charge_withdrawn = false;
  if (data.status === 'ACCEPTED') {
    try {
      const log = await withdrawAcceptedCharges(data.claim_id);
      charge_withdrawn = Boolean(log?.line_items?.find((l) => l.line === data.line_number)?.waived);
    } catch (err) {
      console.warn('[disputes] could not withdraw the charge:', err.message);
    }
  }
  res.json({ dispute: data, charge_withdrawn });
}
