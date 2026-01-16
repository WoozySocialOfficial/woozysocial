import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './AuthPages.css';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { signIn, resetPassword } = useAuth();

  // Prefetch Dashboard chunk while user is on login page
  useEffect(() => {
    import('../DashboardContent');
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate('/dashboard');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);

    const { error } = await resetPassword(resetEmail);

    if (error) {
      setResetError(error.message);
    } else {
      setResetSent(true);
    }
    setResetLoading(false);
  };

  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setResetEmail('');
    setResetSent(false);
    setResetError('');
  };

  if (showForgotPassword) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Reset Password</h1>
            <p className="auth-subtitle">
              {resetSent
                ? 'Check your email for the reset link'
                : 'Enter your email to receive a reset link'
              }
            </p>
          </div>

          {resetSent ? (
            <div className="auth-form">
              <div className="auth-success">
                We've sent a password reset link to <strong>{resetEmail}</strong>.
                Please check your inbox and spam folder.
              </div>
              <button
                type="button"
                className="auth-button"
                onClick={handleBackToLogin}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="auth-form">
              {resetError && <div className="auth-error">{resetError}</div>}

              <div className="form-group">
                <label htmlFor="resetEmail" className="form-label">
                  Email
                </label>
                <input
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="form-input"
                  placeholder="you@example.com"
                  required
                  disabled={resetLoading}
                />
              </div>

              <button type="submit" className="auth-button" disabled={resetLoading}>
                {resetLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <div className="auth-footer">
            <p className="auth-footer-text">
              Remember your password?{' '}
              <button
                onClick={handleBackToLogin}
                className="auth-link"
                disabled={resetLoading}
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="email" className="form-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder="you@example.com"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(true);
                  setResetEmail(email);
                }}
                className="forgot-password-link"
                disabled={loading}
              >
                Forgot password?
              </button>
            </div>
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

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p className="auth-footer-text">
            Don't have an account?{' '}
            <button
              onClick={() => navigate('/signup')}
              className="auth-link"
              disabled={loading}
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
