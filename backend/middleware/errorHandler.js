import { ZodError } from 'zod';
import { HttpError } from '../utils/http.js';

export function notFound(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body.' });
  }

  if (err?.type === 'entity.too.large') {
    const limit = err.limit >= 1048576 ? `${Math.floor(err.limit / 1048576)} MB` : `${Math.floor(err.limit / 1024)} KB`;
    return res.status(413).json({ error: `The request is too large (limit ${limit}).` });
  }

  const status = (err instanceof HttpError || typeof err?.status === 'number') ? err.status : 500;
  if (status >= 500) console.error('[error]', err);

  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(err.details ? { details: err.details } : {}),
  });
}
