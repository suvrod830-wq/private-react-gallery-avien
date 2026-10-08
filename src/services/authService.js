// Auth against our own API (Aiven PostgreSQL + bcrypt + JWT).
// Supabase Auth is completely gone.

import { apiRequest } from '../lib/api';
import { getToken, setToken, clearToken } from '../lib/authToken';

/**
 * Sign in with email + password.
 * @returns {{ profile: object|null, error: string|null }}
 */
export async function signIn(email, password) {
  try {
    const { token, profile } = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(token);
    return { profile, error: null };
  } catch (err) {
    return { profile: null, error: err?.message || 'Invalid credentials.' };
  }
}

export function signOut() {
  // Stateless JWTs: nothing to revoke server-side, the token is just dropped.
  clearToken();
}

/** Profile belonging to the stored token (or null). */
export async function fetchProfile() {
  if (!getToken()) return null;
  try {
    const { profile } = await apiRequest('/auth/me');
    return profile;
  } catch {
    return null;
  }
}

/** Current signed-in { user, profile } — mirrors the old Supabase shape. */
export async function getCurrentProfile() {
  if (!getToken()) return { user: null, profile: null };
  const profile = await fetchProfile();
  if (!profile) return { user: null, profile: null };
  return {
    user: { id: profile.id, email: profile.email },
    profile,
  };
}

/** True when a token is present (session restore will be attempted). */
export function hasStoredSession() {
  return Boolean(getToken());
}
