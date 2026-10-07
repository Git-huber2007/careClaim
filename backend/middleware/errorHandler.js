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
    return res.status(413).json({ error: 'The upload is too large. Use a file under 10 MB.' });
  }

  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error('[error]', err);

  res.status(status).json({
    error: status >= 500 && !(err instanceof HttpError) ? 'Internal server error' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}
