import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isPlaceholder = (v) => !v || /^your_/i.test(v);

export const supabaseConfigured = !isPlaceholder(url) && !isPlaceholder(anonKey);

/** Public (anon) client — used for authentication only. */
export const supabase = supabaseConfigured ? createClient(url, anonKey) : null;
