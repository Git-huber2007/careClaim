import { supabaseAdmin } from '../services/supabase.js';
import { HttpError, dbError } from '../utils/http.js';

/**
 * Verifies the Supabase JWT from the Authorization header.
 * The user identity is taken ONLY from the verified token — never from the body.
 */
export async function requireAuth(req, _res, next) {
  try {
    if (!supabaseAdmin) {
      throw new HttpError(503, 'Supabase is not configured on the server.');
    }

    // Only the header: a token in the URL would end up in access logs.
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'Missing or malformed Authorization header.');

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      // Supabase refusing the token means the session is bad. Supabase not
      // answering, or rate-limiting us, is our outage and must not read as
      // "your session expired": the client would sign a valid user out.
      if (error && (!error.status || error.status >= 500 || error.status === 429)) {
        console.error('[auth] Token verification unavailable:', error.message);
        throw new HttpError(503, 'Sign-in could not be verified right now. Please try again in a moment.');
      }
      if (error) console.warn('[auth] Token rejected:', error.message);
      throw new HttpError(401, 'Invalid or expired session token.');
    }

    req.user = { id: data.user.id, email: data.user.email };
    next();
  } catch (err) {
    next(err);
  }
}

/** Reads the caller's profile row; null until they finish account setup. */
export async function loadProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, patient_id, hospital_org, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw dbError(error);
  return data;
}

/**
 * Loads the caller's role into req.profile. Must run after requireAuth.
 * The role comes ONLY from the profiles table — never from the body or the token.
 */
export async function requireProfile(req, _res, next) {
  try {
    const profile = await loadProfile(req.user.id);
    if (!profile) throw new HttpError(403, 'Account setup is not complete. Choose hospital or patient first.');
    req.profile = profile;
    next();
  } catch (err) {
    next(err);
  }
}

/** Restricts a route to the given role(s). Must run after requireProfile. */
export const requireRole = (...roles) => (req, _res, next) =>
  next(roles.includes(req.profile.role) ? undefined : new HttpError(403, 'This action is not available for your account type.'));
