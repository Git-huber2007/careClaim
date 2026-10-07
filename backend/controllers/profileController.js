import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { supabaseAdmin } from '../services/supabase.js';
import { loadProfile } from '../middleware/auth.js';
import { profileSchema } from '../validation/schemas.js';
import { HttpError, dbError } from '../utils/http.js';

const norm = (s) => String(s || '').trim().toLowerCase();

/** Compared in constant time, so the response time does not reveal how much of a guess was right. */
function codeMatches(given, expected) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** GET /api/me — profile is null until the account picks a role */
export async function getMe(req, res) {
  res.json({
    user: req.user,
    profile: await loadProfile(req.user.id),
    hospital_code_required: Boolean(config.hospitalAccessCode),
  });
}

/** POST /api/me/profile — one-time account setup */
export async function createProfile(req, res) {
  const body = profileSchema.parse(req.body);

  if (await loadProfile(req.user.id)) throw new HttpError(409, 'This account is already set up.');

  // Anyone can register, so hospital accounts must provide the hospital access code
  if (body.role === 'HOSPITAL') {
    if (config.hospitalAccessCode && !codeMatches(body.access_code, config.hospitalAccessCode)) {
      throw new HttpError(403, 'That hospital access code is not valid.', [
        { path: 'access_code', message: 'Ask your hospital administrator for the access code' },
      ]);
    }
  }

  const hospitalOrg = body.role === 'HOSPITAL' ? (body.hospital_org?.trim() || 'CareClaim General Hospital') : null;
  let patientId = null;

  let policy = null;

  if (body.role === 'PATIENT') {
    const { data: matches, error: policyErr } = await supabaseAdmin
      .from('policies')
      .select('id, patient_id, holder_email')
      .in('policy_number', [body.policy_number, body.policy_number.toUpperCase()]);

    if (policyErr) throw dbError(policyErr);

    // One message for "no such policy" and "wrong patient ID", so the form
    // cannot be used to discover which policy numbers exist.
    policy = matches.find((p) => norm(p.patient_id) === norm(body.patient_id));
    if (!policy) {
      throw new HttpError(400, 'That policy number and patient ID do not match our records.', [
        { path: 'policy_number', message: 'Check the policy number and patient ID on your insurance card' },
      ]);
    }

    // Policyholder identity verification: prevent account takeover
    if (policy.holder_email && req.user?.email && norm(policy.holder_email) !== norm(req.user.email)) {
      throw new HttpError(403, 'The email address on this account does not match the policyholder email on file for this policy.', [
        { path: 'policy_number', message: 'You must sign in with the email address registered with your insurance policy' },
      ]);
    }

    patientId = policy.patient_id;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert({ id: req.user.id, role: body.role, patient_id: patientId, hospital_org: hospitalOrg })
    .select('id, role, patient_id, hospital_org, created_at')
    .single();

  if (error) {
    // 23505 = unique violation: the patient ID (or, in a race, this account) is already taken.
    if (error.code === '23505') throw new HttpError(409, 'This patient ID is already linked to another account.');
    throw dbError(error, 'Failed to save profile');
  }

  // Only now that the account really holds the patient ID is the policy tied
  // to its email, and only if no one else's is on it: binding it before the
  // profile was saved left policies tied to accounts that never got them.
  if (policy && !policy.holder_email && req.user.email) {
    const { error: bindErr } = await supabaseAdmin
      .from('policies')
      .update({ holder_email: req.user.email })
      .eq('id', policy.id)
      .is('holder_email', null);
    if (bindErr) console.warn('[profile] could not record the holder email:', bindErr.message);
  }

  res.status(201).json({ profile: data });
}
