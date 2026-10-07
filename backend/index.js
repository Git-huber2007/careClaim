import express from 'express';
import cors from 'cors';
import { config, missingEnv } from './config.js';
import { claimsRouter, policiesRouter } from './routes/claims.js';
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
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: config.geminiModel, configured: missingEnv.length === 0, missing: missingEnv });
});

app.use('/api/claims', claimsRouter);
app.use('/api/policies', policiesRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`\n  CareClaim AI backend → http://localhost:${config.port}`);
  console.log(`  Model: ${config.geminiModel}`);
  if (missingEnv.length) {
    console.warn(`  ⚠ Missing env vars: ${missingEnv.join(', ')} (set them in backend/.env)\n`);
  }
});
