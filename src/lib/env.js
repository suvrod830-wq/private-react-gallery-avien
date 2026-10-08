// Central place for reading + validating environment configuration.
// Only VITE_* values are ever available in the browser.
//
// NOTE: there are NO Supabase variables anymore. All gallery data lives in
// Aiven PostgreSQL behind the /api server; the browser only needs the public
// Cloudinary cloud name (for building delivery URLs).

const read = (key) => {
  const v = import.meta.env[key];
  return typeof v === 'string' && v.length > 0 ? v.trim() : '';
};

export const env = {
  cloudinaryCloudName: read('VITE_CLOUDINARY_CLOUD_NAME'),
  cloudinaryUploadFolder: read('VITE_CLOUDINARY_UPLOAD_FOLDER') || 'personal-gallery',
};

export const isCloudinaryConfigured = Boolean(env.cloudinaryCloudName);

/**
 * The database (Aiven) + JWT_SECRET are server-side concerns — the browser
 * can't see them. From the frontend's perspective the app is "configured"
 * when the public Cloudinary name is present and the API is reachable.
 */
export const isConfigured = isCloudinaryConfigured;

/** Kept as an alias so existing imports keep working. */
export const isFullyConfigured = isCloudinaryConfigured;
