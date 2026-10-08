// POST /api/reels/view — public view counter (deduped per browser session).
// Body: { reel_id, session_key }

import { db } from '../_lib/db.js';
import { json, readJsonBody, requireDb, route } from '../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const handler = route(async (req, res) => {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }
  if (!requireDb(res)) return;

  const body = await readJsonBody(req);
  const reelId = typeof body.reel_id === 'string' ? body.reel_id : '';
  const sessionKey =
    typeof body.session_key === 'string' && body.session_key.trim()
      ? body.session_key.trim().slice(0, 128)
      : 'anonymous';

  if (!UUID_RE.test(reelId)) {
    return json(res, 400, { error: 'reel_id is required.' });
  }

  await db.query('select public.record_reel_view($1, $2)', [reelId, sessionKey]);

  json(res, 200, { ok: true });
});

export default handler;
