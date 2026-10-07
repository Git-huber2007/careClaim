import { supabaseAdmin } from '../services/supabase.js';
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
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new HttpError(401, 'Missing or malformed Authorization header.');
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      throw new HttpError(401, 'Invalid or expired session token.');
    }

    req.user = { id: data.user.id, email: data.user.email };
    next();
  } catch (err) {
    next(err);
  }
}
