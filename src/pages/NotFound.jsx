import { Link } from "react-router-dom";
import "./NotFound.css";

/**
 * NotFound - 404 page for invalid routes
 */
export const NotFound = () => {
  return (
    <div className="not-found-container">
      <div className="not-found-content">
        <div className="not-found-code">404</div>
        <h1 className="not-found-title">Page Not Found</h1>
        <p className="not-found-message">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="not-found-actions">
          <Link to="/dashboard" className="not-found-btn primary">
            Go to Dashboard
          </Link>
          <Link to="/" className="not-found-btn secondary">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
