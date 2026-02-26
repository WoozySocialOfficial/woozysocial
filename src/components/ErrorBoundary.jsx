import React from "react";

/**
 * ErrorBoundary - Catches JavaScript errors in child component tree
 * Displays a fallback UI instead of white screen when errors occur
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });

    // Log to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // You could also send this to an error reporting service like Sentry
    // logErrorToService(error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  handleClearAndReload = () => {
    // Clear all cached data that might be causing issues
    try {
      sessionStorage.removeItem('woozy_profile_cache');
      sessionStorage.removeItem('woozy_workspace_cache');
      localStorage.clear();
    } catch (e) {
      console.error('Error clearing storage:', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.content}>
            <div style={styles.icon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h1 style={styles.title}>Something went wrong</h1>
            <p style={styles.message}>
              We're sorry, but something unexpected happened. Please try refreshing the page or returning to the dashboard.
            </p>
            <p style={{...styles.message, fontSize: '14px', color: '#888'}}>
              If this keeps happening, try clearing your browser data: Open DevTools (F12) → Application → Storage → Clear site data
            </p>
            {this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>Error Details</summary>
                <pre style={styles.errorText}>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <div style={styles.actions}>
              <button style={styles.primaryButton} onClick={this.handleClearAndReload}>
                Clear Cache & Reload
              </button>
              <button style={styles.secondaryButton} onClick={this.handleReload}>
                Refresh Page
              </button>
              <button style={styles.secondaryButton} onClick={this.handleGoHome}>
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f1f6f4',
    padding: '20px',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '48px',
    maxWidth: '500px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    border: '2px solid rgba(0, 0, 0, 0.1)'
  },
  icon: {
    marginBottom: '24px'
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#114C5A',
    margin: '0 0 12px 0'
  },
  message: {
    fontSize: '16px',
    color: '#666',
    lineHeight: '1.6',
    margin: '0 0 24px 0'
  },
  details: {
    backgroundColor: '#fef2f2',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
    textAlign: 'left'
  },
  summary: {
    cursor: 'pointer',
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: '12px'
  },
  errorText: {
    fontSize: '12px',
    color: '#991b1b',
    overflow: 'auto',
    maxHeight: '200px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: '12px 0 0 0'
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap'
  },
  primaryButton: {
    backgroundColor: '#afabf9',
    color: '#114C5A',
    border: '2px solid rgba(0, 0, 0, 0.2)',
    borderRadius: '10px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    color: '#114C5A',
    border: '2px solid rgba(0, 0, 0, 0.2)',
    borderRadius: '10px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
};

export default ErrorBoundary;
