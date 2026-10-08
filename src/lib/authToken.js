// Client-side storage for the JWT issued by POST /api/auth/login.
// Replaces the Supabase session that @supabase/supabase-js used to manage.

const TOKEN_KEY = 'gallery_auth_token';

/** Fired on window when the API rejects an expired/invalid token. */
export const AUTH_EXPIRED_EVENT = 'gallery:auth-expired';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable (private mode etc.) — session just won't persist.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function notifyAuthExpired() {
  clearToken();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}
