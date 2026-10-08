// GET   /api/settings — public site settings (single row)
// PATCH /api/settings — admin update

import { db } from '../db.js';
import { requireAdmin } from '../auth.js';
import { json, readJsonBody, requireDb, route } from '../http.js';
import { logActivity } from '../activity.js';

const UPDATABLE = [
  'site_title', 'site_description', 'logo_url', 'favicon_url',
  'default_layout', 'images_per_page', 'allow_download',
  'social_links', 'contact_email', 'contact_phone',
];

async function get(req, res) {
  const { rows } = await db.query('select * from public.settings order by id limit 1');
  json(res, 200, rows[0] ?? null);
}

async function patch(req, res, admin) {
  const body = await readJsonBody(req);

  const { rows: currentRows } = await db.query(
    'select id from public.settings order by id limit 1',
  );
  const row = currentRows[0];
  if (!row) return json(res, 404, { error: 'Settings row not found. Run the migrations first.' });

  const sets = [];
  const params = [];
  const touched = [];

  for (const col of UPDATABLE) {
    if (col in body) {
      const value = col === 'social_links'
        ? JSON.stringify(body[col] ?? {})
        : body[col];
      params.push(value);
      sets.push(`${col} = $${params.length}`);
      touched.push(col);
    }
  }

  if (!sets.length) return json(res, 400, { error: 'Nothing to update.' });

  params.push(row.id);
  const { rows } = await db.query(
    `update public.settings set ${sets.join(', ')} where id = $${params.length} returning *`,
    params,
  );

  await logActivity(admin.profile.id, 'Updated settings', 'settings', null, { fields: touched });

  json(res, 200, rows[0]);
}

const handler = route(async (req, res) => {
  if (!requireDb(res)) return;

  if (req.method === 'GET') return get(req, res);

  if (req.method === 'PATCH') {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    return patch(req, res, auth);
  }

  return json(res, 405, { error: 'Method not allowed.' });
});

export default handler;
