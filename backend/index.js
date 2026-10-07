import express from 'express';
import cors from 'cors';
import { config, missingEnv } from './config.js';
import {
  claimsRouter,
  disputesRouter,
  insightsRouter,
  meRouter,
  policiesRouter,
  statsRouter,
  verifyRouter,
} from './routes/claims.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.disable('x-powered-by');
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return cb(null, true);
      // Auto-allow all Vercel domains (production, preview, branch deploys) and local development
      if (/^https:\/\/[\w.-]+\.vercel\.app$/i.test(origin) || /^http:\/\/localhost(:\d+)?$/i.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);
// Bodies are small JSON everywhere except the two routes that take a scanned
// bill, which parse their own larger body only after the caller is
// authenticated (routes/claims.js).
// 1 MB holds the largest claim the validation accepts (200 lines of 200 characters).
const json = express.json({ limit: '1mb' });
const takesDocument = (req) => /^\/api\/claims\/(extract-bill|[0-9a-f-]{36}\/document)$/.test(req.path.replace(/\/+$/, '').toLowerCase());
app.use((req, res, next) => (takesDocument(req) ? next() : json(req, res, next)));

app.get('/api/health', (_req, res) => {
  let supabaseHost = null;
  try {
    supabaseHost = config.supabaseUrl ? new URL(config.supabaseUrl).host : null;
  } catch {}
  res.json({
    status: 'ok',
    model: config.geminiModel,
    supabaseHost,
    configured: missingEnv.length === 0,
    missing: missingEnv,
  });
});

app.use('/api/me', meRouter);
app.use('/api/claims', claimsRouter);
app.use('/api/disputes', disputesRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/verify', verifyRouter);
app.use('/api', insightsRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`\n  CareClaim AI backend → http://localhost:${config.port}`);
  console.log(`  Model: ${config.geminiModel}`);
  if (missingEnv.length) {
    console.warn(`  ⚠ Missing env vars: ${missingEnv.join(', ')} (set them in backend/.env)\n`);
  }
  if (config.supabaseUrlFromKey) {
    console.warn(`  ⚠ SUPABASE_URL is not a usable API URL; using ${config.supabaseUrl}, the project the service key belongs to.\n`);
  }
});
