// HTTP client for our own /api (Express in dev, Vercel functions in prod).
// Every request optionally carries the admin JWT; there is no Supabase client
// anywhere in the frontend anymore.

import { getToken, notifyAuthExpired } from './authToken';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isApiError = true;
  }
}

/** Drop empty/undefined params before building the query string. */
function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * @param {string} path   path under /api, e.g. '/images' or '/images/by-slug/x'
 * @param {object} [options]
 * @param {string} [options.method]  HTTP method (default GET)
 * @param {object} [options.body]    JSON body
 * @param {object} [options.query]   query string params
 * @param {number} [options.timeoutMs]
 */
export async function apiRequest(path, { method = 'GET', body, query, timeoutMs = 20000 } = {}) {
  const token = getToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`/api${path}${buildQuery(query)}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error('The request to the API timed out. Please try again.');
    }
    // Network failure — usually means the API server isn't running.
    throw new Error(
      'Cannot reach the API server. Start it with `npm run dev` (Vite on :5173 proxies /api to the Express API on :3001), and make sure DATABASE_URL + JWT_SECRET are set in .env.',
    );
  }
  clearTimeout(timeoutId);

  // Expired/revoked session → drop the token and tell the app (auto sign-out).
  if (res.status === 401 && token) {
    notifyAuthExpired();
  }

  const result = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(result.error || `API request failed (${res.status}).`, res.status);
  }

  return result;
}
