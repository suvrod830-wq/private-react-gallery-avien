// POST /api/images/view — public view counter (deduped per browser session).
// Body: { image_id, session_key }

import { db } from '../_lib/db.js';
import { json, readJsonBody, requireDb, route } from '../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const handler = route(async (req, res) => {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }
  if (!requireDb(res)) return;

  const body = await readJsonBody(req);
  const imageId = typeof body.image_id === 'string' ? body.image_id : '';
  const sessionKey =
    typeof body.session_key === 'string' && body.session_key.trim()
      ? body.session_key.trim().slice(0, 128)
      : 'anonymous';

  if (!UUID_RE.test(imageId)) {
    return json(res, 400, { error: 'image_id is required.' });
  }

  await db.query('select public.record_image_view($1, $2)', [imageId, sessionKey]);

  json(res, 200, { ok: true });
});

export default handler;
