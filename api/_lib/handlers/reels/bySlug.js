// GET /api/reels/by-slug/:slug — public single-reel lookup.
// Drafts are only returned when a valid admin JWT is presented.

import { db } from '../../db.js';
import { getAuthUser } from '../../auth.js';
import { json, requireDb, route } from '../../http.js';

const handler = route(async (req, res) => {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed.' });
  }
  if (!requireDb(res)) return;

  const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
  if (!slug) return json(res, 400, { error: 'slug is required.' });

  const admin = await getAuthUser(req).then((p) => p?.role === 'admin');

  const { rows } = await db.query('select public.get_reel_by_slug($1, $2) as reel', [
    slug,
    admin,
  ]);
  const reel = rows[0]?.reel;

  if (!reel) return json(res, 404, { error: 'Reel not found.' });

  json(res, 200, reel);
});

export default handler;
