// PATCH  /api/taxonomy/:table/:id — admin update (rename recomputes the slug)
// DELETE /api/taxonomy/:table/:id — admin delete

import { db } from '../../db.js';
import { requireAdmin } from '../../auth.js';
import { json, readJsonBody, requireDb, route } from '../../http.js';
import { getTaxonomy } from '../../taxonomy.js';
import { slugify } from '../../slug.js';
import { logActivity } from '../../activity.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function patch(req, res, table, cfg, admin) {
  const id = req.query.id;
  if (!UUID_RE.test(id || '')) return json(res, 404, { error: `${cfg.entityName} not found.` });

  const { rows } = await db.query(`select * from public."${table}" where id = $1`, [id]);
  const current = rows[0];
  if (!current) {
    return json(res, 404, { error: `${cfg.entityName} not found. It may have been deleted.` });
  }

  const body = await readJsonBody(req);
  const sets = [];
  const params = [];
  const setCol = (col, value) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };

  // Only touch name/slug when the name actually changed.
  if (body.name !== undefined) {
    const nextName = String(body.name ?? '').trim();
    if (!nextName) return json(res, 400, { error: `${cfg.entityName} name is required.` });

    const nextSlug = slugify(nextName);
    if (nextSlug !== current.slug) {
      const { rows: slugRows } = await db.query(
        `select slug from public."${table}" where id <> $1`,
        [id],
      );
      if (slugRows.some((r) => r.slug === nextSlug)) {
        return json(res, 409, {
          error: `A ${cfg.entityName.toLowerCase()} named "${nextName}" already exists. Choose a different name.`,
        });
      }
      setCol('name', nextName);
      setCol('slug', nextSlug);
    }
  }

  for (const field of cfg.fields) {
    if (body[field] !== undefined) setCol(field, body[field] === '' ? null : body[field]);
  }

  if (!sets.length) return json(res, 200, current);

  params.push(id);
  const { rows: updated } = await db.query(
    `update public."${table}" set ${sets.join(', ')} where id = $${params.length} returning *`,
    params,
  );

  await logActivity(admin.profile.id, `Updated ${cfg.entityName}`, table, id, { name: updated[0].name });

  json(res, 200, updated[0]);
}

async function remove(req, res, table, cfg, admin) {
  const id = req.query.id;
  if (!UUID_RE.test(id || '')) return json(res, 404, { error: `${cfg.entityName} not found.` });

  const { rows } = await db.query(
    `delete from public."${table}" where id = $1 returning id, name`,
    [id],
  );
  const existing = rows[0];
  if (!existing) return json(res, 404, { error: `${cfg.entityName} not found.` });

  await logActivity(admin.profile.id, `Deleted ${cfg.entityName}`, table, id, { name: existing.name });

  json(res, 200, { ok: true });
}

const handler = route(async (req, res) => {
  if (!requireDb(res)) return;

  const cfg = getTaxonomy(req.query.table);
  if (!cfg) return json(res, 404, { error: 'Unknown taxonomy.' });

  const auth = await requireAdmin(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  const table = req.query.table; // whitelisted above — safe to interpolate

  if (req.method === 'PATCH') return patch(req, res, table, cfg, auth);
  if (req.method === 'DELETE') return remove(req, res, table, cfg, auth);
  return json(res, 405, { error: 'Method not allowed.' });
});

export default handler;
