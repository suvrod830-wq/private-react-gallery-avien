// /api/taxonomy/:table — where :table is one of categories | tags | authors | albums
// (validated against the whitelist in ../../_lib/taxonomy.js — never
// interpolated into SQL unchecked).
//
//   GET            → listWithCounts via taxonomy_list(table) — public
//   GET ?plain=1   → plain rows (id, name, slug, …) for form dropdowns — public
//   POST           → create (admin only; slug computed server-side)

import { db } from '../../db.js';
import { requireAdmin } from '../../auth.js';
import { json, readJsonBody, requireDb, route } from '../../http.js';
import { getTaxonomy } from '../../taxonomy.js';
import { uniqueSlug } from '../../slug.js';
import { logActivity } from '../../activity.js';

async function list(req, res, table) {
  if (req.query.plain === '1') {
    const { rows } = await db.query(
      `select * from public."${table}" order by name`,
    );
    return json(res, 200, rows);
  }

  const { rows } = await db.query('select public.taxonomy_list($1) as entry', [table]);
  json(res, 200, rows.map((r) => r.entry));
}

async function create(req, res, table, cfg) {
  if (!requireDb(res)) return;

  const auth = await requireAdmin(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  const body = await readJsonBody(req);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return json(res, 400, { error: `${cfg.entityName} name is required.` });

  // Deterministic unique slug BEFORE insert (no reliance on error retries).
  const { rows: slugRows } = await db.query(`select slug from public."${table}"`);
  const slug = uniqueSlug(name, slugRows.map((r) => r.slug));

  const cols = ['name', 'slug'];
  const params = [name, slug];

  for (const field of cfg.fields) {
    if (body[field] !== undefined) {
      cols.push(field);
      params.push(body[field] === '' ? null : body[field]);
    }
  }

  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await db.query(
    `insert into public."${table}" (${cols.join(', ')})
     values (${placeholders})
     returning *`,
    params,
  );

  await logActivity(auth.profile.id, `Created ${cfg.entityName}`, table, rows[0].id, { name });

  json(res, 201, rows[0]);
}

const handler = route(async (req, res) => {
  if (!requireDb(res)) return;

  const cfg = getTaxonomy(req.query.table);
  if (!cfg) return json(res, 404, { error: 'Unknown taxonomy.' });

  const table = req.query.table; // whitelisted above — safe to interpolate

  if (req.method === 'GET') return list(req, res, table);
  if (req.method === 'POST') return create(req, res, table, cfg);
  return json(res, 405, { error: 'Method not allowed.' });
});

export default handler;
