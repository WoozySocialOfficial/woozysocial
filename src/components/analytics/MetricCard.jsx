
/**
 * MetricCard - Display a single analytics metric with icon, value, and label
 *
 * @param {React.ReactNode} icon - Icon component (e.g., <FaEye />)
 * @param {string} label - Metric label (e.g., "Views")
 * @param {number|string} value - Metric value (e.g., 1234 or "1.2K")
 * @param {string} trend - Optional trend direction: "up", "down", or null
 * @param {string} trendValue - Optional trend percentage (e.g., "+2.3%")
 * @param {boolean} unavailable - If true, shows "—" instead of value
 */
export const MetricCard = ({
  icon,
  label,
  value,
  trend = null,
  trendValue = null,
  unavailable = false
}) => {
  // Format number for display
  const formatValue = (val) => {
    if (unavailable || val === null || val === undefined) {
      return '—';
    }

    if (typeof val === 'string') {
      return val;
    }

    if (val >= 1000000) {
      return (val / 1000000).toFixed(1) + 'M';
    }
    if (val >= 1000) {
      return (val / 1000).toFixed(1) + 'K';
    }
    return val.toLocaleString();
  };

  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div className="metric-value">
        {formatValue(value)}
        {trend && trendValue && (
          <span className={`metric-trend trend-${trend}`}>
            {trend === 'up' ? '↑' : '↓'} {trendValue}
          </span>
        )}
      </div>
      <div className="metric-label">{label}</div>
    </div>
  );
};
