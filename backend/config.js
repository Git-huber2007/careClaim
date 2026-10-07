import 'dotenv/config';

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY'];

const clean = (val) => (typeof val === 'string' ? val.trim().replace(/^["']|["']$/g, '') : val);
const isPlaceholder = (v) => !v || /^your_/i.test(v);

export const missingEnv = REQUIRED.filter((k) => isPlaceholder(process.env[k]));

export const config = {
  port: Number(process.env.PORT) || 5000,
  supabaseUrl: clean(process.env.SUPABASE_URL)?.replace(/\/+$/, ''),
  supabaseServiceRoleKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  geminiApiKey: clean(process.env.GEMINI_API_KEY),
  geminiModel: clean(process.env.GEMINI_MODEL) || 'gemini-2.5-flash',
  corsOrigins: (clean(process.env.CORS_ORIGIN) || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '')) // browsers send Origin without a trailing slash
    .filter(Boolean),
};
