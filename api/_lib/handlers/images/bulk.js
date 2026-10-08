// POST /api/images/bulk — admin bulk operations.
// Body:
//   { action: 'update',      ids: [...], patch: { is_published?, is_featured?, category_id?, album_id? } }
//   { action: 'add_tags',    ids: [...], tag_ids: [...] }
//   { action: 'remove_tags', ids: [...], tag_ids: [...] }

import { db } from '../../db.js';
import { requireAdmin } from '../../auth.js';
import { json, readJsonBody, requireDb, route } from '../../http.js';
import { logActivity } from '../../activity.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuids = (arr) => (Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && UUID_RE.test(x)) : []);

const handler = route(async (req, res) => {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }
  if (!requireDb(res)) return;

  const auth = await requireAdmin(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  const body = await readJsonBody(req);
  const ids = uuids(body.ids);
  if (!ids.length) return json(res, 400, { error: 'ids is required.' });

  const action = body.action;

  if (action === 'update') {
    const patch = body.patch || {};
    const sets = [];
    const params = [];
    const setCol = (col, value) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };

    if ('is_published' in patch) {
      setCol('is_published', Boolean(patch.is_published));
      setCol('published_at', patch.is_published ? new Date().toISOString() : null);
    }
    if ('is_featured' in patch) setCol('is_featured', Boolean(patch.is_featured));
    if ('category_id' in patch) setCol('category_id', patch.category_id || null);
    if ('album_id' in patch) setCol('album_id', patch.album_id || null);

    if (!sets.length) return json(res, 400, { error: 'Nothing to update.' });

    params.push(ids);
    await db.query(
      `update public.images set ${sets.join(', ')} where id = any($${params.length}::uuid[])`,
      params,
    );
    await logActivity(auth.profile.id, `Bulk updated ${ids.length} images`, 'image', null, { ids });
    return json(res, 200, { ok: true });
  }

  if (action === 'add_tags' || action === 'remove_tags') {
    const tagIds = uuids(body.tag_ids);
    if (!tagIds.length) return json(res, 400, { error: 'tag_ids is required.' });

    if (action === 'add_tags') {
      await db.query(
        `insert into public.image_tags (image_id, tag_id)
         select i.image_id, t.tag_id
           from unnest($1::uuid[]) as i(image_id)
           cross join unnest($2::uuid[]) as t(tag_id)
         on conflict do nothing`,
        [ids, tagIds],
      );
    } else {
      await db.query(
        `delete from public.image_tags
          where image_id = any($1::uuid[]) and tag_id = any($2::uuid[])`,
        [ids, tagIds],
      );
    }

    await logActivity(
      auth.profile.id,
      action === 'add_tags' ? `Bulk added tags to ${ids.length} images` : `Bulk removed tags from ${ids.length} images`,
      'image',
      null,
      { ids, tagIds },
    );
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'Unknown action. Use update, add_tags or remove_tags.' });
});

export default handler;
