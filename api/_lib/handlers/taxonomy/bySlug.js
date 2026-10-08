// GET /api/taxonomy/:table/slug/:slug — public lookup by slug (detail pages).

import { db } from '../../db.js';
import { json, requireDb, route } from '../../http.js';
import { getTaxonomy } from '../../taxonomy.js';

const handler = route(async (req, res) => {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed.' });
  }
  if (!requireDb(res)) return;

  const cfg = getTaxonomy(req.query.table);
  if (!cfg) return json(res, 404, { error: 'Unknown taxonomy.' });

  const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
  if (!slug) return json(res, 400, { error: 'slug is required.' });

  const { rows } = await db.query(
    `select * from public."${req.query.table}" where slug = $1`,
    [slug],
  );
  const row = rows[0];
  if (!row) return json(res, 404, { error: `${cfg.entityName} not found.` });

  json(res, 200, row);
});

export default handler;
