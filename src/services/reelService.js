// Reels data access — everything goes through our own /api, which talks to
// Aiven PostgreSQL. Mirrors imageService for the reels module.

import { apiRequest } from '../lib/api';
import { isConfigured } from '../lib/env';
import { ensureConfigured } from './notConfigured';
import { DEFAULT_PAGE_SIZE } from '../utils/constants';

/** Database-side search + filters + sort + pagination (list_reels function). */
export async function listReels({
  q = '',
  featured = '',
  status = '',
  sort = 'newest',
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  publishedOnly = true,
} = {}) {
  if (!isConfigured) ensureConfigured();

  const result = await apiRequest('/reels', {
    query: {
      q,
      featured,
      status,
      sort,
      page,
      page_size: pageSize,
      published_only: publishedOnly ? undefined : 'false',
    },
  });

  return { items: result.items ?? [], total: Number(result.total ?? 0) };
}

export async function getReelBySlug(slug) {
  if (!isConfigured) ensureConfigured();
  try {
    return await apiRequest(`/reels/by-slug/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

/** Admin: fetch a single reel by id. */
export async function getReelById(id) {
  if (!isConfigured) ensureConfigured();
  try {
    return await apiRequest(`/reels/${id}`);
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

export async function getFeaturedReels(limit = 6) {
  const { items } = await listReels({ featured: 'true', sort: 'newest', pageSize: limit });
  return items;
}

/** One view per session per reel. */
export async function recordReelView(reelId) {
  let sessionKey = localStorage.getItem('gallery_session_id');
  if (!sessionKey) {
    sessionKey = crypto.randomUUID();
    localStorage.setItem('gallery_session_id', sessionKey);
  }
  try {
    await apiRequest('/reels/view', {
      method: 'POST',
      body: { reel_id: reelId, session_key: sessionKey },
    });
  } catch {
    // Silently ignore — view counting is non-critical.
  }
}

// ---------------------------------------------------------------------------
// Admin CRUD (authorization enforced by the API layer — JWT + role check)
// ---------------------------------------------------------------------------

export async function createReel(payload) {
  if (!isConfigured) ensureConfigured();

  const reel = await apiRequest('/reels', {
    method: 'POST',
    body: {
      title: payload.title,
      description: payload.description || null,
      caption: payload.caption || null,
      cloudinary_public_id: payload.cloudinary_public_id,
      secure_url: payload.secure_url,
      thumbnail_public_id: payload.thumbnail_public_id || null,
      thumbnail_url: payload.thumbnail_url || null,
      duration: payload.duration ?? null,
      width: payload.width || null,
      height: payload.height || null,
      format: payload.format || null,
      file_size: payload.file_size ?? null,
      is_featured: Boolean(payload.is_featured),
      is_published: Boolean(payload.is_published),
    },
  });
  return { id: reel.id };
}

export async function updateReel(id, patch) {
  if (!isConfigured) ensureConfigured();
  return apiRequest(`/reels/${id}`, { method: 'PATCH', body: patch });
}

export async function setReelFeatured(id, isFeatured) {
  if (!isConfigured) ensureConfigured();
  await apiRequest(`/reels/${id}`, { method: 'PATCH', body: { is_featured: isFeatured } });
}

export async function setReelPublished(id, isPublished) {
  if (!isConfigured) ensureConfigured();
  await apiRequest(`/reels/${id}`, { method: 'PATCH', body: { is_published: isPublished } });
}

/**
 * Delete a reel: the API removes the DB row and then destroys the Cloudinary
 * VIDEO asset (plus any dedicated thumbnail). Failures are reported back.
 */
export async function deleteReel(id) {
  if (!isConfigured) ensureConfigured();

  const result = await apiRequest(`/reels/${id}`, { method: 'DELETE' });
  return {
    ok: Boolean(result.ok),
    cloudinary: result.cloudinary ?? null,
    ...(result.cloudinaryError ? { cloudinaryError: result.cloudinaryError } : {}),
  };
}
