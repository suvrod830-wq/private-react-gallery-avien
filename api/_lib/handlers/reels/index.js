// GET  /api/reels          — public listing (admins may include drafts)
// POST /api/reels          — create a reel (admin only)
//
// GET query params:
//   q, featured, status, sort, page, page_size, published_only
//
// The heavy lifting happens in the database function list_reels(jsonb),
// created by aiven/migrations/0003_reels.sql.

import { db } from '../../db.js';
import { getAuthUser, requireAdmin } from '../../auth.js';
import { json, readJsonBody, requireDb, route } from '../../http.js';
import { uniqueSlug } from '../../slug.js';
import { logActivity } from '../../activity.js';

const SORTS = new Set(['newest', 'oldest', 'most_viewed', 'recently_updated', 'title_asc', 'title_desc']);

const intParam = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

async function listReelsHandler(req, res) {
  if (!requireDb(res)) return;

  const admin = await getAuthUser(req).then((p) => p?.role === 'admin');
  const q = req.query;

  const opts = {
    q: typeof q.q === 'string' ? q.q : '',
    featured: typeof q.featured === 'string' ? q.featured : '',
    // Non-admins may only ever see published reels — no matter what they ask.
    status: admin && typeof q.status === 'string' ? q.status : '',
    sort: SORTS.has(q.sort) ? q.sort : 'newest',
    page: intParam(q.page, 1, 1, 100000),
    page_size: intParam(q.page_size, 20, 1, 100),
    published_only: admin ? q.published_only !== 'false' : true,
  };

  const { rows } = await db.query('select * from public.list_reels($1::jsonb)', [JSON.stringify(opts)]);

  const total = Number(rows[0]?.total ?? 0);
  const items = rows.map(({ total: _total, ...item }) => item);

  json(res, 200, { items, total });
}

async function createReelHandler(req, res) {
  if (!requireDb(res)) return;

  const auth = await requireAdmin(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  const body = await readJsonBody(req);
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return json(res, 400, { error: 'Title is required.' });
  if (!body.cloudinary_public_id || !body.secure_url) {
    return json(res, 400, { error: 'Cloudinary video asset information is missing.' });
  }

  // Unique slug BEFORE insert — duplicate titles get "-2", "-3", … suffixes.
  const { rows: slugRows } = await db.query('select slug from public.reels');
  const slug = uniqueSlug(title, slugRows.map((r) => r.slug));

  const isPublished = Boolean(body.is_published);
  const duration = Number(body.duration);

  const { rows } = await db.query(
    `insert into public.reels (
       title, slug, description, caption,
       cloudinary_public_id, secure_url, thumbnail_public_id, thumbnail_url,
       duration, width, height, format, file_size,
       is_featured, is_published, published_at
     )
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     returning *`,
    [
      title,
      slug,
      body.description || null,
      body.caption || null,
      body.cloudinary_public_id,
      body.secure_url,
      body.thumbnail_public_id || null,
      body.thumbnail_url || null,
      Number.isFinite(duration) && duration > 0 ? duration : null,
      body.width ?? null,
      body.height ?? null,
      body.format || null,
      body.file_size ?? null,
      Boolean(body.is_featured),
      isPublished,
      isPublished ? new Date().toISOString() : null,
    ],
  );
  const reel = rows[0];

  await logActivity(auth.profile.id, 'Uploaded reel', 'reel', reel.id, { title });

  json(res, 201, reel);
}

const handler = route(async (req, res) => {
  if (req.method === 'GET') return listReelsHandler(req, res);
  if (req.method === 'POST') return createReelHandler(req, res);
  return json(res, 405, { error: 'Method not allowed.' });
});

export default handler;
