// GET /api/images/by-slug/:slug — public single-image lookup.
// Drafts are only returned when a valid admin JWT is presented (this replaces
// the old RLS "hide drafts from anon" behaviour).

import { db } from '../../_lib/db.js';
import { getAuthUser } from '../../_lib/auth.js';
import { json, requireDb, route } from '../../_lib/http.js';

const handler = route(async (req, res) => {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed.' });
  }
  if (!requireDb(res)) return;

  const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
  if (!slug) return json(res, 400, { error: 'slug is required.' });

  const admin = await getAuthUser(req).then((p) => p?.role === 'admin');

  const { rows } = await db.query('select public.get_image_by_slug($1, $2) as image', [
    slug,
    admin,
  ]);
  const image = rows[0]?.image;

  if (!image) return json(res, 404, { error: 'Image not found.' });

  json(res, 200, image);
});

export default handler;
