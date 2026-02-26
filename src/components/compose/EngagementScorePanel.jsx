
/**
 * EngagementScorePanel - Displays post engagement score and best posting time
 */
export const EngagementScorePanel = ({
  score = 0,
  bestPostingTime = "2:00 PM",
  hasRealData = false
}) => {
  // Determine score color
  const getScoreColor = () => {
    if (score >= 80) return "#10b981"; // Green
    if (score >= 60) return "#f59e0b"; // Yellow/Orange
    if (score >= 40) return "#f97316"; // Orange
    return "#ef4444"; // Red
  };

  // Determine score label
  const getScoreLabel = () => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    if (score > 0) return "Needs Work";
    return "Start typing...";
  };

  return (
    <div className="engagement-panel">
      <div className="engagement-score-section">
        <h4 className="engagement-title">Engagement Score</h4>
        <div className="score-circle" style={{ borderColor: getScoreColor() }}>
          <span className="score-value" style={{ color: getScoreColor() }}>
            {score}
          </span>
        </div>
        <span className="score-label" style={{ color: getScoreColor() }}>
          {getScoreLabel()}
        </span>
      </div>

      <div className="best-time-section">
        <h4 className="engagement-title">Best Time to Post</h4>
        <div className="best-time-value">{bestPostingTime}</div>
        <span className="best-time-hint">
          {hasRealData ? "Based on your audience" : "Based on general data"}
        </span>
      </div>

      <div className="engagement-tips">
        <h4 className="engagement-title">Quick Tips</h4>
        <ul className="tips-list">
          <li>Use 3-5 relevant hashtags</li>
          <li>Include a call-to-action</li>
          <li>Add engaging media</li>
          <li>Keep it concise</li>
        </ul>
      </div>
    </div>
  );
};

export default EngagementScorePanel;
