// POST /api/auth/login
// Body: { email, password }
// Checks the credentials against profiles.password_hash (bcrypt) and returns
// a signed JWT + the profile. This replaces Supabase Auth entirely.
//
// Response: { token, profile: { id, email, display_name, role, avatar_url } }

import bcrypt from 'bcryptjs';
import { db } from '../../db.js';
import { signToken } from '../../jwt.js';
import { json, readJsonBody, requireDb, route } from '../../http.js';

const handler = route(async (req, res) => {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }
  if (!requireDb(res)) return;

  const body = await readJsonBody(req);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return json(res, 400, { error: 'Email and password are required.' });
  }

  const { rows } = await db.query(
    `select id, email, display_name, role, avatar_url, password_hash
       from public.profiles
      where lower(email) = lower($1)`,
    [email],
  );
  const profile = rows[0];

  // Same error for "no such user" and "wrong password" — never reveal which.
  if (!profile?.password_hash) {
    // Burn comparable time so timing doesn't leak account existence
    // (valid-format dummy hash, never matches anything).
    await bcrypt.compare(password, '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
    return json(res, 401, { error: 'Invalid email or password.' });
  }

  const match = await bcrypt.compare(password, profile.password_hash);
  if (!match) {
    return json(res, 401, { error: 'Invalid email or password.' });
  }

  const { password_hash: _secret, ...publicProfile } = profile;
  const token = signToken(publicProfile);

  json(res, 200, { token, profile: publicProfile });
});

export default handler;
