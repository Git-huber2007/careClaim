import { supabaseAdmin } from '../services/supabase.js';
import { loadProfile } from '../middleware/auth.js';
import { profileSchema } from '../validation/schemas.js';
import { HttpError } from '../utils/http.js';

const norm = (s) => String(s || '').trim().toLowerCase();

/** GET /api/me — profile is null until the account picks a role */
export async function getMe(req, res) {
  res.json({ user: req.user, profile: await loadProfile(req.user.id) });
}

/** POST /api/me/profile — one-time account setup */
export async function createProfile(req, res) {
  const body = profileSchema.parse(req.body);

  if (await loadProfile(req.user.id)) throw new HttpError(409, 'This account is already set up.');

  let patientId = null;
  if (body.role === 'PATIENT') {
    const { data: matches, error: policyErr } = await supabaseAdmin
      .from('policies')
      .select('patient_id')
      .in('policy_number', [body.policy_number, body.policy_number.toUpperCase()]);

    if (policyErr) throw new HttpError(500, `Database error: ${policyErr.message}`);

    // One message for "no such policy" and "wrong patient ID", so the form
    // cannot be used to discover which policy numbers exist.
    const policy = matches?.find((p) => norm(p.patient_id) === norm(body.patient_id));
    if (!policy) {
      throw new HttpError(400, 'That policy number and patient ID do not match our records.', [
        { path: 'policy_number', message: 'Check the policy number and patient ID on your insurance card' },
      ]);
    }
    patientId = policy.patient_id;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert({ id: req.user.id, role: body.role, patient_id: patientId })
    .select('id, role, patient_id, created_at')
    .single();

  if (error) {
    // 23505 = unique violation: the patient ID (or, in a race, this account) is already taken.
    if (error.code === '23505') {
      throw new HttpError(409, 'This patient ID is already linked to another account.');
    }
    throw new HttpError(500, `Failed to save profile: ${error.message}`);
  }
  res.status(201).json({ profile: data });
}
