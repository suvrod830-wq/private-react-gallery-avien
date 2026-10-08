// JWT issuing + verification (HS256 via jsonwebtoken).
// The secret lives ONLY on the server (JWT_SECRET in .env / Vercel settings).

import jwt from 'jsonwebtoken';

const TOKEN_TTL = '7d';

function secret() {
  const s = process.env.JWT_SECRET || '';
  if (!s) throw new Error('JWT_SECRET is not configured');
  return s;
}

/**
 * Sign a token for a profiles row.
 * @param {{id: string, email: string, role: string}} profile
 */
export function signToken(profile) {
  return jwt.sign(
    { sub: profile.id, email: profile.email, role: profile.role },
    secret(),
    { expiresIn: TOKEN_TTL },
  );
}

/**
 * Verify a token. Returns the payload ({ sub, email, role, iat, exp })
 * or null when the token is missing/malformed/expired.
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    return jwt.verify(token, secret());
  } catch {
    return null;
  }
}

/** Extract the Bearer token from an Authorization header value. */
export function bearerToken(headerValue) {
  const header = headerValue || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}
