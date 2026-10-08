// When the app runs without the public Cloudinary config we must fail honestly
// (no mock data). This error is caught by UI states and rendered as a clear
// "configuration missing" message instead of a crash.
export const NOT_CONFIGURED_MSG =
  'This app is not connected to a backend yet. Add the environment variables to .env (see README.md): VITE_CLOUDINARY_CLOUD_NAME for the browser, DATABASE_URL + JWT_SECRET + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET for the API server.';

export class NotConfiguredError extends Error {
  constructor() {
    super(NOT_CONFIGURED_MSG);
    this.name = 'NotConfiguredError';
    this.isNotConfigured = true;
  }
}

export function ensureConfigured() {
  throw new NotConfiguredError();
}
