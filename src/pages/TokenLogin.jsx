import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../components/auth/AuthPages.css';

export default function TokenLogin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('validating');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      navigate('/login?error=missing_token');
      return;
    }

    validateTokenAndLogin(token);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function validateTokenAndLogin(token) {
    try {
      setStatus('validating');

      // Call backend to validate token
      const response = await fetch('/api/auth/token-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('[TOKEN LOGIN] Validation failed:', data);
        setError(data.error || 'Invalid token');
        setTimeout(() => {
          navigate('/login?error=invalid_token');
        }, 2000);
        return;
      }

      const responseData = data.data || data;

      // Check if backend is telling us to go to login (fallback mode)
      if (responseData.fallbackToLogin) {
        setStatus('redirecting');
        setTimeout(() => {
          window.location.href = responseData.loginUrl || '/login?verified=true';
        }, 1000);
        return;
      }

      // If we have a magic link, redirect to it directly
      // This is the most reliable way to create a session
      if (responseData.magicLink) {
        setStatus('creating_session');

        // Small delay to show status, then redirect to Supabase magic link
        setTimeout(() => {
          window.location.href = responseData.magicLink;
        }, 500);
        return;
      }

      // Final fallback: redirect to login with email pre-filled
      // Users have passwords so they can login manually
      setStatus('redirecting');

      const fallbackUrl = responseData.fallbackLoginUrl || '/login?verified=true';
      setTimeout(() => {
        window.location.href = fallbackUrl;
      }, 1000);

    } catch (err) {
      console.error('[TOKEN LOGIN] Error:', err);
      setError('Something went wrong');
      setTimeout(() => {
        navigate('/login?error=token_error');
      }, 2000);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Woozy Social</h1>
          </div>

          <div className="auth-body" style={{ textAlign: 'center', padding: '2rem' }}>
            {error ? (
              <>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                <h2 style={{ marginBottom: '1rem', color: '#ef4444' }}>Authentication Failed</h2>
                <p style={{ color: '#6b7280' }}>{error}</p>
                <p style={{ color: '#6b7280', marginTop: '1rem', fontSize: '0.875rem' }}>
                  Redirecting to login...
                </p>
              </>
            ) : (
              <>
                <div className="spinner" style={{ margin: '0 auto 1.5rem' }}></div>

                {status === 'validating' && (
                  <>
                    <h2 style={{ marginBottom: '0.5rem' }}>Validating your login...</h2>
                    <p style={{ color: '#6b7280' }}>Please wait a moment</p>
                  </>
                )}

                {status === 'creating_session' && (
                  <>
                    <h2 style={{ marginBottom: '0.5rem' }}>Creating your session...</h2>
                    <p style={{ color: '#6b7280' }}>Almost there!</p>
                  </>
                )}

                {status === 'success' && (
                  <>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                    <h2 style={{ marginBottom: '0.5rem', color: '#10b981' }}>Success!</h2>
                    <p style={{ color: '#6b7280' }}>Redirecting to your dashboard...</p>
                  </>
                )}

                {status === 'redirecting' && (
                  <>
                    <h2 style={{ marginBottom: '0.5rem' }}>Logging you in...</h2>
                    <p style={{ color: '#6b7280' }}>Taking you to your dashboard...</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
