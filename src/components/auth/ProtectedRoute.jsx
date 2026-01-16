import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export const ProtectedRoute = ({ children }) => {
  const { user, loading, profile, authChecked } = useAuth();

  // Optimistic loading: if we have cached profile, show content immediately
  const hasCachedData = !!profile;

  // Show loading spinner only if:
  // - No cached data AND still loading
  if (loading && !hasCachedData) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#0a0a0a'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid #333',
          borderTop: '3px solid #7c3aed',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Only redirect to login AFTER auth has been checked with Supabase
  // This prevents premature redirects when using cached data
  if (authChecked && !user) {
    return <Navigate to="/login" replace />;
  }

  // Show content if we have cached data OR if user is authenticated
  if (hasCachedData || user) {
    return children;
  }

  // Still waiting for auth check - show nothing (brief moment)
  return null;
};
