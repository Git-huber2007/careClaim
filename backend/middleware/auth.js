import { supabaseAdmin } from '../services/supabase.js';
import { config } from '../config.js';
import { HttpError } from '../utils/http.js';

/**
 * Verifies the Supabase JWT from the Authorization header.
 * The user identity is taken ONLY from the verified token — never from the body.
 */
export async function requireAuth(req, _res, next) {
  try {
    if (!supabaseAdmin) {
      throw new HttpError(503, 'Supabase is not configured on the server.');
    }

    const header = req.headers.authorization || '';
    let token = '';
    if (header.startsWith('Bearer ')) {
      token = header.slice(7).trim();
    } else if (req.query?.token) {
      token = String(req.query.token).trim();
    }

    if (!token) {
      throw new HttpError(401, 'Missing or malformed Authorization header or token query parameter.');
    }

    let user = null;
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (data?.user) {
      user = data.user;
    } else {
      // Direct verification fallback via Supabase auth API endpoint
      try {
        const directRes = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': config.supabaseServiceRoleKey,
          },
        });
        if (directRes.ok) {
          const directData = await directRes.json();
          if (directData?.id) {
            user = directData;
          }
        }
      } catch (fallbackErr) {
        console.error('[auth] Direct token verification failed:', fallbackErr?.message || fallbackErr);
      }
    }

    if (!user) {
      const detail = error?.message || 'Invalid or expired session token.';
      console.warn('[auth] Authentication failed:', detail);
      throw new HttpError(401, `Invalid or expired session token (${detail})`);
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    next(err);
  }
}

/** Reads the caller's profile row; null until they finish account setup. */
export async function loadProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, patient_id, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    // 42P01 / PGRST205: the profiles table is missing, i.e. the schema predates roles.
    if (error.code === '42P01' || error.code === 'PGRST205') {
      throw new HttpError(503, 'Database schema is out of date. Re-run supabase/schema.sql in the Supabase SQL Editor.');
    }
    throw new HttpError(500, `Database error: ${error.message}`);
  }
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
