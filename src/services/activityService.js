/**
 * Activity logging now happens SERVER-SIDE: every /api handler that mutates
 * data writes its own activity_logs row (with the authenticated admin's id).
 * This client stub keeps old call sites compiling but does nothing — a
 * browser asking the database to log "I did something" would be meaningless
 * (and untrustworthy) now that RLS is gone.
 */
// eslint-disable-next-line no-unused-vars
export async function logActivity(action, entityType = null, entityId = null, metadata = null) {
  // intentionally empty — the API is the source of truth for activity logs
}
