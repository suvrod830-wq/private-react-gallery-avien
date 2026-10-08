// Server-side environment reading. Runs only on Vercel / the local API server,
// so these secrets are never exposed to the browser.
//
// Database: Aiven for PostgreSQL (DATABASE_URL). Auth: self-issued JWTs
// signed with JWT_SECRET — there is NO Supabase anywhere in this stack.

const read = (key) => {
  const v = process.env[key];
  return typeof v === 'string' && v.length > 0 ? v.trim() : '';
};

export const serverEnv = {
  databaseUrl: read('DATABASE_URL'),
  jwtSecret: read('JWT_SECRET'),
  cloudinaryCloudName: read('VITE_CLOUDINARY_CLOUD_NAME'),
  cloudinaryApiKey: read('CLOUDINARY_API_KEY'),
  cloudinaryApiSecret: read('CLOUDINARY_API_SECRET'),
};

/** Returns true only when all required server-side env vars are present. */
export const serverReady = () => serverEnvErrors().length === 0;

/**
 * Returns an array of error messages listing exactly which env vars are
 * missing. The message hints at where to find each one.
 */
export function serverEnvErrors() {
  const missing = [];
  if (!serverEnv.databaseUrl)
    missing.push('DATABASE_URL (Aiven for PostgreSQL connection string)');
  if (!serverEnv.jwtSecret)
    missing.push('JWT_SECRET (generate one — see .env.example)');
  if (!serverEnv.cloudinaryCloudName)
    missing.push('VITE_CLOUDINARY_CLOUD_NAME (from Cloudinary Dashboard)');
  if (!serverEnv.cloudinaryApiKey)
    missing.push('CLOUDINARY_API_KEY (from Cloudinary Dashboard)');
  if (!serverEnv.cloudinaryApiSecret)
    missing.push('CLOUDINARY_API_SECRET (from Cloudinary Dashboard — keep secret!)');
  return missing;
}

/** Just the database + auth essentials (everything except Cloudinary). */
export function coreEnvErrors() {
  return serverEnvErrors().filter(
    (m) => m.startsWith('DATABASE_URL') || m.startsWith('JWT_SECRET'),
  );
}
