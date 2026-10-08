// Image data access — everything goes through our own /api, which talks to
// Aiven PostgreSQL. Function names/signatures are unchanged from the old
// Supabase version so pages and hooks didn't have to change.

import { apiRequest } from '../lib/api';
import { isConfigured } from '../lib/env';
import { ensureConfigured, NotConfiguredError } from './notConfigured';
import { DEFAULT_PAGE_SIZE } from '../utils/constants';

/**
 * Database-side search + filters + sort + pagination (list_images function).
 */
export async function listImages({
  q = '',
  category = '',
  tag = '',
  author = '',
  album = '',
  featured = '',
  status = '',
  dateFrom = '',
  dateTo = '',
  sort = 'newest',
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  publishedOnly = true,
} = {}) {
  if (!isConfigured) ensureConfigured();

  const result = await apiRequest('/images', {
    query: {
      q,
      category,
      tag,
      author,
      album,
      featured,
      status,
      date_from: dateFrom,
      date_to: dateTo,
      sort,
      page,
      page_size: pageSize,
      published_only: publishedOnly ? undefined : 'false',
    },
  });

  return { items: result.items ?? [], total: Number(result.total ?? 0) };
}

export async function getImageBySlug(slug) {
  if (!isConfigured) ensureConfigured();
  try {
    return await apiRequest(`/images/by-slug/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

/** Admin: fetch a single image by id with its tag ids. */
export async function getImageById(id) {
  if (!isConfigured) ensureConfigured();
  try {
    return await apiRequest(`/images/${id}`);
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

/** Related images: same category first, otherwise sharing a tag (spec §4). */
export async function getRelatedImages(image, { limit = 8 } = {}) {
  if (!image) return [];
  const { items: byCategory } = await listImages({
    category: image.category?.slug || '',
    sort: 'newest',
    pageSize: limit + 1,
  });
  const withoutSelf = byCategory.filter((i) => i.id !== image.id);
  if (withoutSelf.length >= limit) return withoutSelf.slice(0, limit);

  const tagSlug = image.tags?.[0]?.slug || '';
  if (tagSlug) {
    const { items: byTag } = await listImages({ tag: tagSlug, sort: 'newest', pageSize: limit + 1 });
    const rest = byTag.filter((i) => i.id !== image.id && !withoutSelf.some((x) => x.id === i.id));
    return [...withoutSelf, ...rest].slice(0, limit);
  }
  return withoutSelf.slice(0, limit);
}

/** Prev/next navigation within the same filtered set. */
export async function getAdjacentImages(image, filters = {}) {
  if (!image) return { prev: null, next: null };
  const { items } = await listImages({
    ...filters,
    q: filters.q || '',
    sort: filters.sort || 'newest',
    pageSize: 100,
  });
  const idx = items.findIndex((i) => i.id === image.id);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? items[idx - 1] : null,
    next: idx < items.length - 1 ? items[idx + 1] : null,
  };
}

export async function getFeaturedImages(limit = 6) {
  const { items } = await listImages({ featured: 'true', sort: 'newest', pageSize: limit });
  return items;
}

export async function getLatestImages(limit = 12) {
  const { items } = await listImages({ sort: 'newest', pageSize: limit });
  return items;
}

export async function getMostViewedImages(limit = 6) {
  const { items } = await listImages({ sort: 'most_viewed', pageSize: limit });
  return items;
}

/** One view per session per image (spec §23). */
export async function recordImageView(imageId) {
  let sessionKey = localStorage.getItem('gallery_session_id');
  if (!sessionKey) {
    sessionKey = crypto.randomUUID();
    localStorage.setItem('gallery_session_id', sessionKey);
  }
  try {
    await apiRequest('/images/view', {
      method: 'POST',
      body: { image_id: imageId, session_key: sessionKey },
    });
  } catch {
    // Silently ignore — view counting is non-critical.
  }
}

// ---------------------------------------------------------------------------
// Admin CRUD (authorization enforced by the API layer — JWT + role check)
// ---------------------------------------------------------------------------

export async function createImage({ tags = [], ...payload }) {
  if (!isConfigured) ensureConfigured();

  // The server computes the unique slug, inserts the row and links the tags.
  const image = await apiRequest('/images', {
    method: 'POST',
    body: {
      title: payload.title,
      description: payload.description || null,
      caption: payload.caption || null,
      alt_text: payload.alt_text || null,
      cloudinary_public_id: payload.cloudinary_public_id,
      cloudinary_url: payload.cloudinary_url || null,
      secure_url: payload.secure_url,
      thumbnail_url: payload.thumbnail_url || null,
      width: payload.width || null,
      height: payload.height || null,
      format: payload.format || null,
      file_size: payload.file_size || null,
      category_id: payload.category_id || null,
      author_id: payload.author_id || null,
      album_id: payload.album_id || null,
      sort_order: payload.sort_order ?? 0,
      is_featured: Boolean(payload.is_featured),
      is_published: Boolean(payload.is_published),
      allow_download: Boolean(payload.allow_download),
      tag_ids: tags,
    },
  });
  return { id: image.id };
}

export async function updateImage(id, { tags, ...payload }) {
  if (!isConfigured) ensureConfigured();

  const body = { ...payload };
  if (tags) body.tags = tags;

  return apiRequest(`/images/${id}`, { method: 'PATCH', body });
}

export async function setImageFeatured(id, isFeatured) {
  if (!isConfigured) ensureConfigured();
  await apiRequest(`/images/${id}`, { method: 'PATCH', body: { is_featured: isFeatured } });
}

export async function setImagePublished(id, isPublished) {
  if (!isConfigured) ensureConfigured();
  await apiRequest(`/images/${id}`, { method: 'PATCH', body: { is_published: isPublished } });
}

/** Bulk ops (spec §25). */
export async function bulkUpdateImages(ids, patch) {
  if (!ids.length) return;
  const clean = {};
  if ('is_published' in patch) clean.is_published = patch.is_published;
  if ('is_featured' in patch) clean.is_featured = patch.is_featured;
  if ('category_id' in patch) clean.category_id = patch.category_id || null;
  if ('album_id' in patch) clean.album_id = patch.album_id || null;
  await apiRequest('/images/bulk', {
    method: 'POST',
    body: { action: 'update', ids, patch: clean },
  });
}

export async function bulkAddTags(ids, tagIds) {
  if (!ids.length || !tagIds.length) return;
  await apiRequest('/images/bulk', {
    method: 'POST',
    body: { action: 'add_tags', ids, tag_ids: tagIds },
  });
}

export async function bulkRemoveTags(ids, tagIds) {
  if (!ids.length || !tagIds.length) return;
  await apiRequest('/images/bulk', {
    method: 'POST',
    body: { action: 'remove_tags', ids, tag_ids: tagIds },
  });
}

/**
 * Delete an image: the API removes the DB row (image_tags cascade) and then
 * destroys the Cloudinary asset. If the CDN delete fails the response says
 * so — we never pretend the deletion succeeded (spec §28).
 */
export async function deleteImage(id) {
  if (!isConfigured) ensureConfigured();

  const result = await apiRequest(`/images/${id}`, { method: 'DELETE' });
  return {
    ok: Boolean(result.ok),
    cloudinary: result.cloudinary ?? null,
    ...(result.cloudinaryError ? { cloudinaryError: result.cloudinaryError } : {}),
  };
}

export async function getDashboardStats() {
  if (!isConfigured) ensureConfigured();
  return apiRequest('/stats');
}

export async function getRecentActivity(limit = 10) {
  if (!isConfigured) ensureConfigured();
  return apiRequest('/activity', { query: { limit } });
}

export { NotConfiguredError };
