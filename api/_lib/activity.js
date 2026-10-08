// Admin activity logging — the API layer records every mutation it performs.
// (The old frontend `logActivity` RPC calls are gone; logging happens where
// the authoritative action happens: the server.)

import { db } from './db.js';

/**
 * @param {string|null} userId   profiles.id of the acting admin
 * @param {string} action        e.g. "Uploaded image"
 * @param {string|null} entityType
 * @param {string|null} entityId
 * @param {object|null} metadata
 */
export async function logActivity(userId, action, entityType = null, entityId = null, metadata = null) {
  try {
    await db.query('select public.log_activity($1, $2, $3, $4, $5)', [
      userId ?? null,
      action,
      entityType,
      entityId,
      metadata ? JSON.stringify(metadata) : null,
    ]);
  } catch (err) {
    // Activity logging must never break the primary operation.
    console.error('[api] activity log failed:', err.message);
  }
}
