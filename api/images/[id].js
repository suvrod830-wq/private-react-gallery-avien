// /api/images/:id — admin-only single-image endpoint.
//   GET    → image row + tagIds (for the edit form)
//   PATCH  → partial update (incl. tag replacement + published_at handling)
//   DELETE → remove row, then best-effort destroy the Cloudinary asset

import { db } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { json, readJsonBody, requireDb, route } from '../_lib/http.js';
import { uniqueSlug } from '../_lib/slug.js';
import { logActivity } from '../_lib/activity.js';
import { cloudinary } from '../_lib/cloudinary.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UPDATABLE = [
  'title', 'description', 'caption', 'alt_text',
  'cloudinary_public_id', 'cloudinary_url', 'secure_url', 'thumbnail_url',
  'width', 'height', 'format', 'file_size',
  'category_id', 'author_id', 'album_id', 'sort_order',
  'is_featured', 'is_published', 'allow_download',
];

async function getById(req, res) {
  const id = req.query.id;
  if (!UUID_RE.test(id || '')) return json(res, 404, { error: 'Image not found.' });

  const { rows } = await db.query('select * from public.images where id = $1', [id]);
  const image = rows[0];
  if (!image) return json(res, 404, { error: 'Image not found.' });

  const { rows: tagRows } = await db.query(
    'select tag_id from public.image_tags where image_id = $1',
    [id],
  );

  json(res, 200, { ...image, tagIds: tagRows.map((t) => t.tag_id) });
}

async function patch(req, res, admin) {
  const id = req.query.id;
  if (!UUID_RE.test(id || '')) return json(res, 404, { error: 'Image not found.' });

  const { rows } = await db.query('select * from public.images where id = $1', [id]);
  const current = rows[0];
  if (!current) return json(res, 404, { error: 'Image not found.' });

  const body = await readJsonBody(req);

  const sets = [];
  const params = [];
  const setCol = (col, value) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };

  for (const col of UPDATABLE) {
    if (col in body) {
      setCol(col, body[col] === '' ? null : body[col]);
    }
  }

  // Renaming → recompute a collision-free slug.
  if (typeof body.title === 'string' && body.title.trim()) {
    const { rows: slugRows } = await db.query(
      'select slug from public.images where id <> $1',
      [id],
    );
    setCol('slug', uniqueSlug(body.title.trim(), slugRows.map((r) => r.slug)));
  }

  // Keep published_at meaningful: set when first published, clear on unpublish.
  if (body.is_published === true && current.published_at === null) {
    setCol('published_at', new Date().toISOString());
  } else if (body.is_published === false) {
    setCol('published_at', null);
  }

  let image = current;
  if (sets.length) {
    params.push(id);
    const { rows: updated } = await db.query(
      `update public.images set ${sets.join(', ')} where id = $${params.length} returning *`,
      params,
    );
    image = updated[0];
  }

  if (Array.isArray(body.tags)) {
    const tagIds = body.tags.filter((t) => typeof t === 'string' && UUID_RE.test(t));
    await db.query('delete from public.image_tags where image_id = $1', [id]);
    if (tagIds.length) {
      await db.query(
        `insert into public.image_tags (image_id, tag_id)
         select $1, unnest($2::uuid[])
         on conflict do nothing`,
        [id, tagIds],
      );
    }
  }

  await logActivity(admin.profile.id, 'Updated image', 'image', id, { title: image.title });

  json(res, 200, image);
}

async function remove(req, res, admin) {
  const id = req.query.id;
  if (!UUID_RE.test(id || '')) return json(res, 404, { error: 'Image not found.' });

  const { rows } = await db.query(
    'delete from public.images where id = $1 returning id, title, cloudinary_public_id',
    [id],
  );
  const existing = rows[0];
  if (!existing) return json(res, 404, { error: 'Image not found.' });

  await logActivity(admin.profile.id, 'Deleted image', 'image', id, { title: existing.title });

  // Best-effort CDN cleanup. If it fails we report it so the UI can offer a
  // retry — we never pretend the deletion succeeded.
  if (!existing.cloudinary_public_id) {
    return json(res, 200, { ok: true, cloudinary: null });
  }
  try {
    const result = await cloudinary.uploader.destroy(existing.cloudinary_public_id);
    if (result.result === 'not found') {
      return json(res, 200, { ok: true, cloudinary: null, alreadyMissing: true });
    }
    if (result.result !== 'ok') {
      return json(res, 200, {
        ok: false,
        cloudinary: null,
        cloudinaryError: 'The database row was deleted, but the CDN asset could not be removed.',
        result,
      });
    }
    json(res, 200, { ok: true, cloudinary: result });
  } catch (err) {
    json(res, 200, {
      ok: false,
      cloudinary: null,
      cloudinaryError: err.message || 'Failed to delete from CDN.',
    });
  }
}

const handler = route(async (req, res) => {
  if (!requireDb(res)) return;

  if (req.method === 'GET') {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    return getById(req, res);
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  if (req.method === 'PATCH') return patch(req, res, auth);
  if (req.method === 'DELETE') return remove(req, res, auth);
  return json(res, 405, { error: 'Method not allowed.' });
});

export default handler;
