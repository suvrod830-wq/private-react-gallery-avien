import { getToken } from '../lib/authToken';
import { env } from '../lib/env';

// All destructive/signed Cloudinary operations go through our serverless API
// (/api) — the API secret never leaves the server (spec §9, §18).

async function apiFetch(path, body) {
  // The admin JWT authorizes the API call (Supabase sessions are gone).
  const token = getToken();

  // AbortController timeout — fetch should never hang indefinitely.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout

  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || `API request failed (${res.status}).`);
    }
    return json;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(
        'The upload request timed out. Check that the API server is running (npm run dev starts both Vite and the API on :3001). If it is, verify your server-side environment variables in .env (DATABASE_URL, JWT_SECRET, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).',
      );
    }
    throw err;
  }
}

/**
 * Signed upload: ask our server for signature, then POST the file straight to
 * Cloudinary. Returns normalized asset metadata (spec §9, §68).
 *
 * @param {File} file
 * @param {object} [opts]
 * @param {string} [opts.folder]
 * @param {'image'|'video'} [opts.resourceType]  'video' for reels
 */
export async function uploadToCloudinary(file, { folder, resourceType = 'image', onProgress: _onProgress } = {}) {
  const signed = await apiFetch('/api/cloudinary/sign', {
    folder: folder || env.cloudinaryUploadFolder,
    ...(resourceType === 'video' ? { resource_type: 'video' } : {}),
  });

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signed.api_key);
  form.append('timestamp', String(signed.timestamp));
  form.append('signature', signed.signature);
  form.append('folder', signed.folder);
  // NOTE: do NOT append resource_type here — Cloudinary excludes it from the
  // signature (the /video/upload URL path already selects it), so sending it
  // as a param is unnecessary.

  const uploadUrl = `https://api.cloudinary.com/v1_1/${signed.cloud_name}/${signed.resource_type || 'image'}/upload`;

  const uploadController = new AbortController();
  // Videos can be much larger than images — give them a longer runway.
  const uploadLimitMs = signed.resource_type === 'video' ? 300000 : 60000;
  const uploadTimeout = setTimeout(() => uploadController.abort(), uploadLimitMs);

  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      body: form,
      signal: uploadController.signal,
    });
    clearTimeout(uploadTimeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Cloudinary upload failed.');
    }
    const asset = await res.json();

    return {
      cloudinary_public_id: asset.public_id,
      cloudinary_url: asset.url,
      secure_url: asset.secure_url,
      width: asset.width ?? null,
      height: asset.height ?? null,
      format: asset.format ?? null,
      file_size: asset.bytes ?? null,
      // Video-only metadata (Cloudinary reports duration for video assets).
      ...(asset.duration !== undefined ? { duration: asset.duration } : {}),
    };
  } catch (err) {
    clearTimeout(uploadTimeout);
    if (err.name === 'AbortError') {
      throw new Error(
        'Upload to Cloudinary timed out after 60 seconds. Check your Cloudinary configuration (VITE_CLOUDINARY_CLOUD_NAME + server-side CLOUDINARY_API_KEY/API_SECRET).',
      );
    }
    throw err;
  }
}

/** Upload a video asset (reels). Same signed flow, resource_type = video. */
export function uploadVideoToCloudinary(file, opts = {}) {
  return uploadToCloudinary(file, { ...opts, resourceType: 'video' });
}

/**
 * Permanently remove a Cloudinary asset (admin-only, server-verified).
 * @param {string} publicId
 * @param {object} [opts]
 * @param {'image'|'video'} [opts.resourceType]
 */
export async function deleteCloudinaryAsset(publicId, { resourceType = 'image' } = {}) {
  return apiFetch('/api/cloudinary/delete', {
    public_id: publicId,
    ...(resourceType === 'video' ? { resource_type: 'video' } : {}),
  });
}
