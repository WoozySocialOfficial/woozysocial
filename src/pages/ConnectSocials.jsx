import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";
import "./ConnectSocials.css";

/**
 * ConnectSocials - Embedded Ayrshare social account linking page
 * This keeps users on woozysocial.com instead of showing ayrshare URL
 */
const ConnectSocials = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const [iframeUrl, setIframeUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Get URL from query params or fetch new one
  useEffect(() => {
    const urlFromParams = searchParams.get("url");

    if (urlFromParams) {
      setIframeUrl(decodeURIComponent(urlFromParams));
      setLoading(false);
    } else if (activeWorkspace?.id) {
      // Fetch JWT URL if not provided
      fetchJwtUrl();
    } else {
      setError("No workspace selected");
      setLoading(false);
    }
  }, [searchParams, activeWorkspace]);

  const fetchJwtUrl = async () => {
    try {
      const res = await fetch(
        `${baseURL}/api/generate-jwt?workspaceId=${activeWorkspace.id}${user?.id ? `&userId=${user.id}` : ""}`
      );
      const data = await res.json();

      if (data.success && data.data?.url) {
        setIframeUrl(data.data.url);
      } else {
        setError(data.error || "Failed to load connection page");
      }
    } catch (err) {
      console.error("Error fetching JWT:", err);
      setError("Failed to load connection page");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Go back or to dashboard
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  };

  const handleDone = () => {
    // Refresh accounts and go to dashboard
    navigate("/dashboard?refresh=accounts");
  };

  if (loading) {
    return (
      <div className="connect-socials-page">
        <div className="connect-socials-loading">
          <div className="loading-spinner"></div>
          <p>Loading connection page...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="connect-socials-page">
        <div className="connect-socials-error">
          <h2>Unable to Load</h2>
          <p>{error}</p>
          <button onClick={handleClose} className="btn-back">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="connect-socials-page">
      <div className="connect-socials-header">
        <div className="header-left">
          <img src="/assets/woozysocial.png" alt="Woozy Social" className="header-logo" />
          <h1>Connect Your Social Accounts</h1>
        </div>
        <div className="header-right">
          <button onClick={handleDone} className="btn-done">
            Done
          </button>
          <button onClick={handleClose} className="btn-close">
            &times;
          </button>
        </div>
      </div>

      <div className="connect-socials-iframe-container">
        {iframeUrl && (
          <iframe
            src={iframeUrl}
            title="Connect Social Accounts"
            className="connect-socials-iframe"
            allow="clipboard-write"
          />
        )}
      </div>
    </div>
  );
};

export default ConnectSocials;
