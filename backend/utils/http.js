export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** supabase/schema.sql has been changed since it was last run on this database. */
export const schemaOutOfDate = () =>
  new HttpError(503, 'Database schema is out of date. Re-run supabase/schema.sql in the Supabase SQL Editor.');

// A table (42P01 / PGRST205) or column (42703 / PGRST204) the code expects is not in the database.
const MISSING_IN_SCHEMA = ['42P01', 'PGRST205', '42703', 'PGRST204'];

/** A failed database call as an HttpError, saying what to do when the cause is an old schema. */
export const dbError = (error, what = 'Database error') =>
  MISSING_IN_SCHEMA.includes(error.code) ? schemaOutOfDate() : new HttpError(500, `${what}: ${error.message}`);

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
