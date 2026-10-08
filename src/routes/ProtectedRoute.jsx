import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from '../components/ui/Feedback';

/**
 * UX-level route guard (spec §33: frontend protection is UX only — the real
 * security boundary is the API layer, which verifies the JWT + admin role on
 * every request).
 */
export function ProtectedRoute({ children }) {
  const { user, profile, loading, isConfigured } = useAuth();
  const location = useLocation();

  if (!isConfigured) {
    return <Navigate to="/admin/login" replace />;
  }
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-stone-100 dark:bg-stone-950">
        <Spinner />
      </div>
    );
  }
  if (!user || profile?.role !== 'admin') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
