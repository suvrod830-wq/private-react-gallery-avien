// /api/reels/:id — admin-only single-reel endpoint.
//   GET    → reel row (for the edit form)
//   PATCH  → partial update (incl. published_at handling + video replacement)
//   DELETE → remove row, then best-effort destroy the Cloudinary VIDEO asset
//            (+ optional dedicated thumbnail image asset)

import { db } from '../../db.js';
import { requireAdmin } from '../../auth.js';
import { json, readJsonBody, requireDb, route } from '../../http.js';
import { uniqueSlug } from '../../slug.js';
import { logActivity } from '../../activity.js';
import { cloudinary } from '../../cloudinary.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UPDATABLE = [
  'title', 'description', 'caption',
  'cloudinary_public_id', 'secure_url', 'thumbnail_public_id', 'thumbnail_url',
  'duration', 'width', 'height', 'format', 'file_size',
  'is_featured', 'is_published',
];

async function getById(req, res) {
  const id = req.query.id;
  if (!UUID_RE.test(id || '')) return json(res, 404, { error: 'Reel not found.' });

  const { rows } = await db.query('select * from public.reels where id = $1', [id]);
  const reel = rows[0];
  if (!reel) return json(res, 404, { error: 'Reel not found.' });

  json(res, 200, reel);
}

async function patch(req, res, admin) {
  const id = req.query.id;
  if (!UUID_RE.test(id || '')) return json(res, 404, { error: 'Reel not found.' });

  const { rows } = await db.query('select * from public.reels where id = $1', [id]);
  const current = rows[0];
  if (!current) return json(res, 404, { error: 'Reel not found.' });

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
      'select slug from public.reels where id <> $1',
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

  let reel = current;
  if (sets.length) {
    params.push(id);
    const { rows: updated } = await db.query(
      `update public.reels set ${sets.join(', ')} where id = $${params.length} returning *`,
      params,
    );
    reel = updated[0];
  }

  await logActivity(admin.profile.id, 'Updated reel', 'reel', id, { title: reel.title });

  json(res, 200, reel);
}

async function remove(req, res, admin) {
  const id = req.query.id;
  if (!UUID_RE.test(id || '')) return json(res, 404, { error: 'Reel not found.' });

  const { rows } = await db.query(
    'delete from public.reels where id = $1 returning id, title, cloudinary_public_id, thumbnail_public_id',
    [id],
  );
  const existing = rows[0];
  if (!existing) return json(res, 404, { error: 'Reel not found.' });

  await logActivity(admin.profile.id, 'Deleted reel', 'reel', id, { title: existing.title });

  // Best-effort CDN cleanup. If it fails we report it so the UI can offer a
  // retry — we never pretend the deletion succeeded.
  const cleanup = [];
  if (existing.cloudinary_public_id) {
    cleanup.push(
      cloudinary.uploader
        .destroy(existing.cloudinary_public_id, { resource_type: 'video' })
        .then((result) => ({ asset: existing.cloudinary_public_id, result }))
        .catch((err) => ({ asset: existing.cloudinary_public_id, error: err.message })),
    );
  }
  if (existing.thumbnail_public_id) {
    cleanup.push(
      cloudinary.uploader
        .destroy(existing.thumbnail_public_id) // thumbnails are images
        .then((result) => ({ asset: existing.thumbnail_public_id, result }))
        .catch((err) => ({ asset: existing.thumbnail_public_id, error: err.message })),
    );
  }

  if (!cleanup.length) return json(res, 200, { ok: true, cloudinary: null });

  const results = await Promise.all(cleanup);
  const failed = results.filter((r) => r.error || (r.result && r.result.result !== 'ok' && r.result.result !== 'not found'));

  if (failed.length) {
    return json(res, 200, {
      ok: false,
      cloudinary: results,
      cloudinaryError: 'The database row was deleted, but some CDN assets could not be removed.',
    });
  }
  json(res, 200, { ok: true, cloudinary: results });
}

const handler = route(async (req, res) => {
  if (!requireDb(res)) return;

  const auth = await requireAdmin(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  if (req.method === 'GET') return getById(req, res);
  if (req.method === 'PATCH') return patch(req, res, auth);
  if (req.method === 'DELETE') return remove(req, res, auth);
  return json(res, 405, { error: 'Method not allowed.' });
});

export default handler;
