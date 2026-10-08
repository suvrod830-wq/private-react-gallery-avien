import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AUTH_EXPIRED_EVENT } from '../lib/authToken';
import { getCurrentProfile, fetchProfile } from '../services/authService';
import { isConfigured } from '../lib/env';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!isConfigured) return null;
    const p = await fetchProfile();
    setProfile(p);
    setUser(p ? { id: p.id, email: p.email } : null);
    return p;
  }, []);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const { user: userNow, profile: profileNow } = await getCurrentProfile();
        if (!active) return;
        setUser(userNow);
        setProfile(profileNow);
      } catch (error) {
        console.error('Auth initialization failed:', error);
        if (active) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    init();

    // Token expired / rejected by the API → automatic sign-out.
    const onExpired = () => {
      setUser(null);
      setProfile(null);
      setLoading(false);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);

    return () => {
      active = false;
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      isAdmin: Boolean(profile?.role === 'admin'),
      isConfigured,
      refreshProfile,
    }),
    [user, profile, loading, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
