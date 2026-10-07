import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const url = rawUrl ? (/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).replace(/\/+$/, '') : '';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const isPlaceholder = (v) => !v || /^your_/i.test(v);

export const supabaseConfigured = !isPlaceholder(url) && !isPlaceholder(anonKey);

/** Public (anon) client — used for authentication only. */
export const supabase = supabaseConfigured ? createClient(url, anonKey) : null;
