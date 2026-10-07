import { supabaseAdmin } from '../services/supabase.js';
import { getAccessibleClaim } from './claimsController.js';
import { disputeResponseSchema, disputeSubmissionSchema, uuidParamSchema } from '../validation/schemas.js';
import { HttpError } from '../utils/http.js';

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

  if (req.profile.role === 'PATIENT') {
    query = query.eq('patient_user_id', req.user.id);
  } else if (req.profile?.hospital_org) {
    query = query.or(`claims.hospital_org.eq.${req.profile.hospital_org},claims.hospital_user_id.eq.${req.user.id}`);
  } else {
    query = query.eq('claims.hospital_user_id', req.user.id);
  }

  let { data, error } = await query.order('created_at', { ascending: false });

  // Fallback if hospital_org column has not been added to claims schema yet
  if (error && error.code === '42703') {
    const fallbackQuery = supabaseAdmin
      .from('disputes')
      .select(`${DISPUTE_COLUMNS}, claims!inner(patient_id, diagnosis_code, hospital_user_id)`);
    const q = req.profile.role === 'PATIENT'
      ? fallbackQuery.eq('patient_user_id', req.user.id)
      : fallbackQuery.eq('claims.hospital_user_id', req.user.id);
    const retry = await q.order('created_at', { ascending: false });
    data = retry.data;
    error = retry.error;
  }

  if (error) throw new HttpError(500, `Database error: ${error.message}`);
  res.json({
    disputes: (data || []).map(({ claims, ...d }) => ({ ...d, patient_id: claims.patient_id, diagnosis_code: claims.diagnosis_code })),
  });
}

/** POST /api/disputes/:id/respond — the hospital that filed the claim answers */
export async function respondToDispute(req, res) {
  const { id } = uuidParamSchema.parse(req.params);
  const body = disputeResponseSchema.parse(req.body);

  let { data: dispute, error: findErr } = await supabaseAdmin
    .from('disputes')
    .select('id, status, claims!inner(hospital_user_id, hospital_org)')
    .eq('id', id)
    .maybeSingle();

  if (findErr && findErr.code === '42703') {
    const retry = await supabaseAdmin
      .from('disputes')
      .select('id, status, claims!inner(hospital_user_id)')
      .eq('id', id)
      .maybeSingle();
    dispute = retry.data;
    findErr = retry.error;
  }

  if (findErr) throw new HttpError(500, `Database error: ${findErr.message}`);
  if (!dispute) throw new HttpError(404, 'Dispute not found.');

  const isAuthor = dispute.claims.hospital_user_id === req.user.id;
  const isOrgMember = req.profile?.hospital_org && dispute.claims.hospital_org === req.profile.hospital_org;
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
  res.json({ dispute: data });
}
