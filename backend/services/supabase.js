import { createClient } from '@supabase/supabase-js';
import { config, missingEnv } from '../config.js';

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 * This bypasses RLS, so every query MUST be scoped manually
 * (e.g. `.eq('hospital_user_id', req.user.id)`).
 */
export const supabaseAdmin =
  missingEnv.includes('SUPABASE_URL') || missingEnv.includes('SUPABASE_SERVICE_ROLE_KEY')
    ? null
    : createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
