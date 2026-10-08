#!/usr/bin/env node
/**
 * Create (or reset) an administrator account in Aiven PostgreSQL.
 *
 * Usage:
 *   npm run create-admin -- you@example.com "TemporaryPass123!"
 *
 * Reads DATABASE_URL from .env (server-side only). The password is stored as
 * a bcrypt hash in profiles.password_hash — never in plaintext. If the email
 * already exists, its password is reset and the role is (re)set to admin,
 * so this script doubles as the "forgot password" recovery path.
 *
 * Also usable as a lightweight login check afterwards:
 *   curl -s -X POST http://localhost:3001/api/auth/login \
 *        -H 'Content-Type: application/json' \
 *        -d '{"email":"you@example.com","password":"TemporaryPass123!"}'
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db, dbConfigured } from '../api/_lib/db.js';

const [email, password] = process.argv.slice(2);

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

if (!dbConfigured()) {
  fail('Missing DATABASE_URL in .env (Aiven for PostgreSQL connection string).');
}
if (!process.env.JWT_SECRET) {
  console.warn('⚠ JWT_SECRET is not set — login via /api/auth/login will not work until you add it.');
}
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail('Provide a valid email, e.g.  npm run create-admin -- you@example.com "Password123!"');
}
if (!password || password.length < 8) {
  fail('Provide a password of at least 8 characters.');
}

const hash = await bcrypt.hash(password, 10);
const displayName = email.split('@')[0];

try {
  const { rows } = await db.query(
    `insert into public.profiles (email, display_name, role, password_hash)
     values (lower($1), $2, 'admin', $3)
     on conflict (email) do update
        set role = 'admin',
            password_hash = excluded.password_hash,
            display_name = coalesce(public.profiles.display_name, excluded.display_name)
     returning id, email, role`,
    [email, displayName, hash],
  );

  const profile = rows[0];
  console.log('\n✔ Administrator ready:');
  console.log(`   email: ${profile.email}`);
  console.log(`   role : ${profile.role}`);
  console.log(`   id   : ${profile.id}`);
  console.log('\nSign in at /admin/login');
} catch (err) {
  if (err?.code === '42P01') {
    fail('The profiles table does not exist yet. Run `npm run migrate:aiven` first.');
  }
  fail(`Could not create admin: ${err.message}`);
} finally {
  await db.end();
}
