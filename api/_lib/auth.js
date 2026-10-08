// Authorization helpers for the API layer.
//
// Supabase Auth is gone. Identity now works like this:
//   1. POST /api/auth/login checks email + bcrypt password_hash against the
//      `profiles` table and issues a signed JWT (see jwt.js).
//   2. Every protected request sends `Authorization: Bearer <token>`.
//   3. We verify the JWT and resolve the CURRENT profile row from Postgres
//      (the role claim in the token is never trusted blindly — a demoted or
//      deleted user is rejected immediately).

import { db, dbConfigured } from './db.js';
import { bearerToken, verifyToken } from './jwt.js';
import { coreEnvErrors } from './env.js';

/**
 * Resolve the authenticated profile for a request, or null.
 * @param {object} req
 * @returns {Promise<object|null>} profiles row (id, email, display_name, role, avatar_url)
 */
export async function getAuthUser(req) {
  const token = bearerToken(req.headers?.authorization);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload?.sub) return null;

  if (!dbConfigured()) return null;

  const { rows } = await db.query(
    `select id, email, display_name, role, avatar_url
       from public.profiles
      where id = $1`,
    [payload.sub],
  );
  return rows[0] ?? null;
}

function missingCoreResponse() {
  const vars = coreEnvErrors();
  return {
    ok: false,
    status: 503,
    error: `Server not configured. Missing: ${vars.join(', ')}. Add them to your .env file (server-only section, never exposed in the browser).`,
  };
}

/**
 * Require any authenticated profile (used by /api/auth/me).
 */
export async function requireAuth(req) {
  if (!dbConfigured() || !process.env.JWT_SECRET) return missingCoreResponse();

  const header = req.headers?.authorization || '';
  if (!bearerToken(header)) {
    return { ok: false, status: 401, error: 'Authentication required.' };
  }

  const profile = await getAuthUser(req);
  if (!profile) {
    return { ok: false, status: 401, error: 'Invalid or expired session.' };
  }
  return { ok: true, profile };
}

/**
 * Authenticate the request's JWT and verify the caller is an admin.
 * The browser role value is never trusted — we resolve the real role from
 * the `profiles` table on every request.
 *
 * @param {object} req - Incoming request
 * @returns {Promise<{ok: true, profile: object} | {ok: false, status: number, error: string}>}
 */
export async function requireAdmin(req) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;

  if (auth.profile.role !== 'admin') {
    return { ok: false, status: 403, error: 'Administrator access required.' };
  }
  return { ok: true, profile: auth.profile };
}

/** Shared JSON response helper (works for both Vercel & Express). */
export function json(res, status, body) {
  res.status(status);
  res.setHeader?.('Content-Type', 'application/json');
  if (typeof res.json === 'function') return res.json(body);
  res.end(JSON.stringify(body));
}
