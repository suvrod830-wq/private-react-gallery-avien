// Small HTTP helpers that work identically under Vercel serverless functions
// and the local Express dev server.

import { dbConfigured } from './db.js';

export function json(res, status, body) {
  if (res.headersSent) return;
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  if (typeof res.json === 'function') return res.json(body);
  res.end(JSON.stringify(body));
}

/**
 * Read and JSON.parse the request body (max ~1 MB).
 *
 * Handles three scenarios:
 * 1. Express `express.json()` has already parsed → returns the object directly.
 * 2. Express `express.raw()` stored a Buffer → parse it now.
 * 3. No middleware / Vercel serverless → read from the raw stream.
 */
export function readJsonBody(req) {
  return new Promise((resolve) => {
    // Case 1: Already parsed as JSON object by express.json() middleware.
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      resolve(req.body);
      return;
    }
    // Case 2: Parsed as raw Buffer by express.raw() middleware.
    if (req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
      try {
        resolve(JSON.parse(req.body.toString('utf8')));
      } catch {
        resolve({});
      }
      return;
    }
    // Case 3: No middleware — read the raw stream (Vercel or plain Node).
    let data = '';
    const onData = (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy();
    };
    const onEnd = () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    };
    const onError = () => resolve({});
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);

    // If body was already consumed before we attached listeners, end silently.
    if (req.complete || req.readableEnded) {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      resolve({});
    }
  });
}

/**
 * Guard for endpoints that need the database. Answers 503 and returns false
 * when DATABASE_URL is missing, so handlers can `if (!requireDb(res)) return;`.
 */
export function requireDb(res) {
  if (!dbConfigured()) {
    json(res, 503, {
      error:
        'Database not configured. Add DATABASE_URL (Aiven for PostgreSQL) and JWT_SECRET to your .env, then restart the API server.',
    });
    return false;
  }
  if (!process.env.JWT_SECRET) {
    json(res, 503, {
      error: 'JWT_SECRET is not configured. Add it to your .env, then restart the API server.',
    });
    return false;
  }
  return true;
}

/** Map common Postgres error codes to friendly HTTP responses. */
export function pgErrorToStatus(err) {
  if (err?.code === '23505') return 409; // unique violation
  if (err?.code === '23503') return 409; // foreign key violation
  if (err?.code === '23502') return 400; // not null violation
  if (err?.code === '22P02') return 400; // invalid input syntax (bad uuid etc.)
  return 500;
}

/** Wrap an async handler with try/catch → consistent 500 responses. */
export function route(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error('[api] unhandled error:', err);
      const status = pgErrorToStatus(err);
      if (status === 409) {
        return json(res, 409, { error: err.message || 'Conflict.' });
      }
      json(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  };
}
