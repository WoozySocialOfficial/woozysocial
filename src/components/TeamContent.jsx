import React, { useState } from "react";
import "./TeamContent.css";

export const TeamContent = () => {
  const [teamMembers] = useState([
    { name: "John Doe", role: "Admin", email: "john@example.com", avatar: "👤" },
    { name: "Jane Smith", role: "Editor", email: "jane@example.com", avatar: "👤" }
  ]);

  const handleAddMember = () => {
    console.log("Add team member clicked");
    // TODO: Implement add member functionality
  };

  return (
    <div className="team-container">
      <div className="team-header">
        <h1 className="team-title">Team</h1>
        <p className="team-subtitle">Manage your team members and permissions</p>
      </div>

      <div className="team-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Team Members</h2>
            <p className="section-subtitle">Invite and manage your team collaborators</p>
          </div>
          <button className="add-member-button" onClick={handleAddMember}>
            + Add Member
          </button>
        </div>

        <div className="team-content">
          <div className="members-list">
            {teamMembers.map((member, index) => (
              <div key={index} className="member-card">
                <div className="member-info">
                  <div className="member-avatar">{member.avatar}</div>
                  <div className="member-details">
                    <h3 className="member-name">{member.name}</h3>
                    <p className="member-email">{member.email}</p>
                  </div>
                </div>
                <div className="member-actions">
                  <span className="member-role">{member.role}</span>
                  <button className="remove-button">Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div className="team-info-box">
            <p className="info-text">Team management interface would go here...</p>
            <p className="info-subtext">
              Add team members, assign roles, and manage permissions to collaborate effectively
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
