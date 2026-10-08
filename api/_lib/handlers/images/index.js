// GET  /api/images          — public listing (admins may include drafts)
// POST /api/images          — create an image (admin only)
//
// GET query params mirror the old Supabase RPC options:
//   q, category, tag, author, album, featured, status, date_from, date_to,
//   sort, page, page_size
//
// The heavy lifting happens in the database function list_images(jsonb),
// created by aiven/migrations/0001_initial_schema.sql.

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

async function listImagesHandler(req, res) {
  if (!requireDb(res)) return;

  const admin = await getAuthUser(req).then((p) => p?.role === 'admin');
  const q = req.query;

  const opts = {
    q: typeof q.q === 'string' ? q.q : '',
    category: typeof q.category === 'string' ? q.category : '',
    tag: typeof q.tag === 'string' ? q.tag : '',
    author: typeof q.author === 'string' ? q.author : '',
    album: typeof q.album === 'string' ? q.album : '',
    featured: typeof q.featured === 'string' ? q.featured : '',
    // Non-admins may only ever see published images — no matter what they ask.
    status: admin && typeof q.status === 'string' ? q.status : '',
    date_from: typeof q.date_from === 'string' ? q.date_from : '',
    date_to: typeof q.date_to === 'string' ? q.date_to : '',
    sort: SORTS.has(q.sort) ? q.sort : 'newest',
    page: intParam(q.page, 1, 1, 100000),
    page_size: intParam(q.page_size, 20, 1, 100),
    published_only: admin ? q.published_only !== 'false' : true,
  };

  const { rows } = await db.query('select * from public.list_images($1::jsonb)', [JSON.stringify(opts)]);

  const total = Number(rows[0]?.total ?? 0);
  const items = rows.map(({ total: _total, ...item }) => item);

  json(res, 200, { items, total });
}

async function createImageHandler(req, res) {
  if (!requireDb(res)) return;

  const auth = await requireAdmin(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  const body = await readJsonBody(req);
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return json(res, 400, { error: 'Title is required.' });
  if (!body.cloudinary_public_id || !body.secure_url) {
    return json(res, 400, { error: 'Cloudinary asset information is missing.' });
  }

  // Unique slug BEFORE insert — duplicate titles get "-2", "-3", … suffixes.
  const { rows: slugRows } = await db.query('select slug from public.images');
  const slug = uniqueSlug(title, slugRows.map((r) => r.slug));

  const isPublished = Boolean(body.is_published);

  const values = {
    title,
    slug,
    description: body.description || null,
    caption: body.caption || null,
    alt_text: body.alt_text || null,
    cloudinary_public_id: body.cloudinary_public_id,
    cloudinary_url: body.cloudinary_url || null,
    secure_url: body.secure_url,
    thumbnail_url: body.thumbnail_url || null,
    width: body.width ?? null,
    height: body.height ?? null,
    format: body.format || null,
    file_size: body.file_size ?? null,
    category_id: body.category_id || null,
    author_id: body.author_id || null,
    album_id: body.album_id || null,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    is_featured: Boolean(body.is_featured),
    is_published: isPublished,
    allow_download: Boolean(body.allow_download),
    published_at: isPublished ? new Date().toISOString() : null,
  };

  const { rows } = await db.query(
    `insert into public.images (
       title, slug, description, caption, alt_text,
       cloudinary_public_id, cloudinary_url, secure_url, thumbnail_url,
       width, height, format, file_size,
       category_id, author_id, album_id, sort_order,
       is_featured, is_published, allow_download, published_at
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
     )
     returning *`,
    [
      values.title, values.slug, values.description, values.caption, values.alt_text,
      values.cloudinary_public_id, values.cloudinary_url, values.secure_url, values.thumbnail_url,
      values.width, values.height, values.format, values.file_size,
      values.category_id, values.author_id, values.album_id, values.sort_order,
      values.is_featured, values.is_published, values.allow_download, values.published_at,
    ],
  );
  const image = rows[0];

  const tagIds = Array.isArray(body.tag_ids) ? body.tag_ids.filter((t) => typeof t === 'string') : [];
  if (tagIds.length) {
    await db.query(
      `insert into public.image_tags (image_id, tag_id)
       select $1, unnest($2::uuid[])
       on conflict do nothing`,
      [image.id, tagIds],
    );
  }

  await logActivity(auth.profile.id, 'Uploaded image', 'image', image.id, { title });

  json(res, 201, image);
}

const handler = route(async (req, res) => {
  if (req.method === 'GET') return listImagesHandler(req, res);
  if (req.method === 'POST') return createImageHandler(req, res);
  return json(res, 405, { error: 'Method not allowed.' });
});

export default handler;
