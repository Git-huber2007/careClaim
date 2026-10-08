import 'dotenv/config';

const clean = (val) => (typeof val === 'string' ? val.trim().replace(/^["']|["']$/g, '').trim() : val);
const isPlaceholder = (v) => !v || /^your_/i.test(v);
const env = (key) => clean(process.env[key]);

/**
 * A usable API base: any http(s) URL except supabase.com itself, which is the
 * website and dashboard, and an easy thing to paste here by mistake.
 */
function apiUrl(value) {
  if (isPlaceholder(value)) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || /(^|\.)supabase\.com$/i.test(url.hostname)) return null;
    return value.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** A Supabase key is a JWT that names its project, so the project's API URL can be rebuilt from it. */
function projectUrlFromKey(key) {
  try {
    const { ref } = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    return ref ? `https://${ref}.supabase.co` : null;
  } catch {
    return null;
  }
}

const supabaseServiceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
const configuredUrl = apiUrl(env('SUPABASE_URL'));
// With an unusable SUPABASE_URL, fall back to the project the service key belongs to.
const supabaseUrl = configuredUrl ?? (isPlaceholder(supabaseServiceRoleKey) ? null : projectUrlFromKey(supabaseServiceRoleKey));

export const config = {
  port: Number(process.env.PORT) || 5000,
  supabaseUrl,
  supabaseUrlFromKey: !configuredUrl && Boolean(supabaseUrl),
  supabaseServiceRoleKey,
  geminiApiKey: env('GEMINI_API_KEY'),
  geminiModel: 'gemini-2.5-flash',
  // Optional cap on model requests (adjudications and bill scans) per account per day; 0 = no cap.
  aiDailyLimitPerUser: Math.max(0, Math.floor(Number(env('AI_DAILY_LIMIT_PER_USER'))) || 0),
  // Required for hospital accounts so arbitrary users cannot claim hospital status
  hospitalAccessCode: env('HOSPITAL_ACCESS_CODE') || 'CARECLAIM-HOSPITAL-2026',
  corsOrigins: (env('CORS_ORIGIN') || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '')) // browsers send Origin without a trailing slash
    .filter(Boolean),
};

const REQUIRED = {
  SUPABASE_URL: config.supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: config.supabaseServiceRoleKey,
  GEMINI_API_KEY: config.geminiApiKey,
};

/** Judged on the values the server will actually use, after cleaning. */
export const missingEnv = Object.keys(REQUIRED).filter((k) => isPlaceholder(REQUIRED[k]));
