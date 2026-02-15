import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './GetStarted.css';

const GetStartedSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    const completeOnboarding = async () => {
      try {
        const sessionId = searchParams.get('session_id');

        if (!sessionId) {
          throw new Error('No session ID found');
        }

        // Call main app to complete onboarding and get login token
        const response = await fetch('/api/signup/complete-onboarding', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sessionId })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to complete onboarding');
        }

        // Check if we got a successful response with login token
        if (data.success && data.data && data.data.loginToken) {
          // Clear wizard state from sessionStorage
          sessionStorage.removeItem('wizardState');

          // Redirect to token login endpoint
          window.location.href = `/auth/token-login?token=${data.data.loginToken}`;
        } else {
          throw new Error('No login token received from server');
        }

      } catch (err) {
        console.error('Error completing onboarding:', err);
        setError(err.message);

        // Fallback: redirect to login page after 3 seconds
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      }
    };

    completeOnboarding();
  }, [searchParams, navigate]);

  const handleManualLogin = () => {
    navigate('/login');
  };

  return (
    <div className="get-started-container">
      <div className="wizard-step text-center">
        {!error ? (
          <>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
            <h2>Welcome to Woozy Social!</h2>
            <p className="step-subtitle">Your account has been created successfully</p>

            <div className="spinner"></div>

            <p className="info-text" style={{ marginTop: '2rem' }}>
              Redirecting you to your dashboard...
            </p>

            <p style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '2rem' }}>
              If you're not redirected automatically,{' '}
              <button
                onClick={handleManualLogin}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#667eea',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                click here
              </button>
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
            <h2>Something went wrong</h2>
            <p className="step-subtitle" style={{ color: '#ef4444' }}>
              {error}
            </p>

            <p className="info-text" style={{ marginTop: '2rem' }}>
              Redirecting you to the login page...
            </p>

            <button
              onClick={handleManualLogin}
              className="btn btn-primary"
              style={{ marginTop: '2rem', maxWidth: '300px' }}
            >
              Go to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default GetStartedSuccess;
