import React, { useState } from "react";
import "./BrandProfileContent.css";

export const BrandProfileContent = () => {
  const [brandName, setBrandName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [toneOfVoice, setToneOfVoice] = useState("Professional");

  const handleSave = () => {
    console.log("Saving brand profile:", { brandName, brandDescription, toneOfVoice });
    alert("Brand profile saved!");
  };

  return (
    <div className="brand-profile-container">
      <div className="brand-profile-header">
        <h1 className="page-title">Brand Profile</h1>
        <p className="page-subtitle">Manage your brand voice, visuals, and guidelines</p>
      </div>

      <div className="brand-profile-content">
        <div className="brand-section">
          <h2 className="section-title">Brand Information</h2>
          <p className="section-subtitle">Define your brand identity</p>

          <div className="form-group">
            <label htmlFor="brandName">Brand Name</label>
            <input
              type="text"
              id="brandName"
              placeholder="Your brand name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="brandDescription">Brand Description</label>
            <textarea
              id="brandDescription"
              placeholder="Describe your brand..."
              rows="6"
              value={brandDescription}
              onChange={(e) => setBrandDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="toneOfVoice">Tone of Voice</label>
            <select
              id="toneOfVoice"
              value={toneOfVoice}
              onChange={(e) => setToneOfVoice(e.target.value)}
            >
              <option value="Professional">Professional</option>
              <option value="Casual">Casual</option>
              <option value="Friendly">Friendly</option>
              <option value="Formal">Formal</option>
              <option value="Humorous">Humorous</option>
              <option value="Inspirational">Inspirational</option>
            </select>
          </div>

          <button className="save-button" onClick={handleSave}>
            Save Brand Profile
          </button>
        </div>
      </div>
    </div>
  );
};
