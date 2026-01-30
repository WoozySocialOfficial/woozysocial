import React from "react";
import { AnalyticsContent } from "../../components/AnalyticsContent";
import "./ClientAnalytics.css";

export const ClientAnalytics = () => {
  return (
    <div className="client-analytics-page">
      <div className="client-analytics-header">
        <h1>Analytics</h1>
        <p>View performance metrics and trends from all your social media accounts.</p>
      </div>

      <AnalyticsContent />
    </div>
  );
};
