import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabaseClient';
import './AuthPages.css';

export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if URL has recovery parameters (code for PKCE, hash for implicit flow)
    const urlParams = new URLSearchParams(window.location.search);
    const hasCode = urlParams.has('code');
    const hasHashToken = window.location.hash.includes('access_token');
    const hasRecoveryParams = hasCode || hasHashToken;

    // Listen for auth events from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsValidSession(true);
          setChecking(false);
        } else if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
          // PKCE flow fires SIGNED_IN or INITIAL_SESSION after code exchange
          setIsValidSession(true);
          setChecking(false);
        }
      }
    );

    // Fallback: check session after a delay
    // If URL has recovery params, give PKCE exchange more time (5s)
    // Otherwise just check for existing session quickly (1s)
    const fallbackDelay = hasRecoveryParams ? 5000 : 1000;

    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsValidSession(true);
      }
      setChecking(false);
    }, fallbackDelay);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      // Sign out so user must log in with new password
      await supabase.auth.signOut();

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking session
  if (checking) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Verifying...</h1>
            <p className="auth-subtitle">Please wait while we verify your reset link</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error if no valid session
  if (!isValidSession && !success) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Invalid Link</h1>
            <p className="auth-subtitle">This reset link is invalid or has expired</p>
          </div>

          <div className="auth-form">
            <div className="auth-error">
              Please request a new password reset link from the login page.
            </div>
            <button
              type="button"
              className="auth-button"
              onClick={() => navigate('/login')}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Password Updated</h1>
            <p className="auth-subtitle">Your password has been successfully reset</p>
          </div>

          <div className="auth-form">
            <div className="auth-success">
              You can now sign in with your new password.
            </div>
            <button
              type="button"
              className="auth-button"
              onClick={() => navigate('/login')}
            >
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Set New Password</h1>
          <p className="auth-subtitle">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              New Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword" className="form-label">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-input"
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <div className="auth-footer">
          <p className="auth-footer-text">
            Remember your password?{' '}
            <button
              onClick={() => navigate('/login')}
              className="auth-link"
              disabled={loading}
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
