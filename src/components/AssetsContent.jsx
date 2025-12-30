import React, { useState } from "react";
import "./AssetsContent.css";

export const AssetsContent = () => {
  const [assets, setAssets] = useState([]);

  const handleUpload = () => {
    // TODO: Implement file upload functionality
    console.log("Upload media clicked");
  };

  const handleRefresh = () => {
    // TODO: Implement refresh functionality
    console.log("Refresh clicked");
  };

  return (
    <div className="assets-container">
      <div className="assets-header">
        <h1 className="assets-title">Assets</h1>
        <p className="assets-subtitle">Store and organize media for your campaigns</p>
      </div>

      <div className="media-library-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Media Library</h2>
            <p className="section-subtitle">Upload and manage your creative assets</p>
          </div>
          <div className="action-buttons">
            <button className="upload-button" onClick={handleUpload}>
              📤 Upload Media
            </button>
            <button className="refresh-button" onClick={handleRefresh}>
              🔄 Refresh
            </button>
          </div>
        </div>

        <div className="media-content">
          {assets.length === 0 ? (
            <div className="empty-state">
              <div className="cloud-icon">☁️</div>
              <p className="empty-text">Upload your first asset</p>
            </div>
          ) : (
            <div className="media-grid">
              {assets.map((asset, index) => (
                <div key={index} className="media-item">
                  {/* Media items will be rendered here */}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
