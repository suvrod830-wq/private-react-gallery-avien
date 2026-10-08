// GET /api/activity?limit=N — recent admin activity log entries.

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

  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));

  const { rows } = await db.query(
    `select l.id, l.action, l.entity_type, l.entity_id, l.metadata, l.created_at,
            p.display_name as user_name, p.email as user_email
       from public.activity_logs l
       left join public.profiles p on p.id = l.user_id
      order by l.created_at desc
      limit $1`,
    [limit],
  );

  json(res, 200, rows);
});

export default handler;
