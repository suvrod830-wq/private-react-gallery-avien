// Shared PostgreSQL pool (Aiven for PostgreSQL).
//
// The pool is created LAZILY on first use so that:
//   * the dev server can boot (and serve /api/health) even before
//     DATABASE_URL is configured, and
//   * endpoints respond with a clean 503 instead of crashing the process.

import pg from 'pg';

const { Pool, types } = pg;

// node-pg returns PostgreSQL bigint (int8) columns as strings by default.
// The old Supabase REST layer returned them as JSON numbers, and the
// frontend expects numbers (file sizes, counters, stats). All int8 values in
// this app are counts/sizes — comfortably within Number precision.
types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

let pool = null;

/** True when DATABASE_URL is present. */
export function dbConfigured() {
  const v = process.env.DATABASE_URL;
  return typeof v === 'string' && v.trim().length > 0;
}

function getPool() {
  if (!dbConfigured()) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL.trim(),
      // Aiven requires TLS. Set DATABASE_SSL=false to connect to a local
      // PostgreSQL without SSL (e.g. tests / local dev instances).
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (error) => {
      console.error('Unexpected PostgreSQL pool error:', error.message);
    });
  }
  return pool;
}

/**
 * Thin stable facade over the pool. Scripts and API handlers both use
 * `db.query(...)`, `db.connect()`, `db.end()` — identical to before, but
 * safe to import even when DATABASE_URL is missing.
 */
export const db = {
  query: (...args) => getPool().query(...args),
  connect: () => getPool().connect(),
  end: () => (pool ? pool.end() : Promise.resolve()),
};
