import React from "react";
import { SocialInboxContent } from "../../components/SocialInboxContent";
import "./ClientSocialInbox.css";

export const ClientSocialInbox = () => {
  return (
    <div className="client-social-inbox-page">
      <div className="client-social-inbox-header">
        <h1>Social Inbox</h1>
        <p>Manage direct messages and replies from your social media platforms.</p>
      </div>

      <SocialInboxContent />
    </div>
  );
};
