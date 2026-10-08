// GET /api/stats — admin dashboard statistics (database function).

import { db } from './_lib/db.js';
import { requireAdmin } from './_lib/auth.js';
import { json, requireDb, route } from './_lib/http.js';

const handler = route(async (req, res) => {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed.' });
  }
  if (!requireDb(res)) return;

  const auth = await requireAdmin(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  const { rows } = await db.query('select * from public.dashboard_stats()');

  json(res, 200, rows[0] ?? null);
});

export default handler;
