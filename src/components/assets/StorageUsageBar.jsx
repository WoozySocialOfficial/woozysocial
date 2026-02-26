import './StorageUsageBar.css';

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
};

export const StorageUsageBar = ({ used = 0, limit = 0 }) => {
  if (limit === 0) return null;

  const percentage = Math.min((used / limit) * 100, 100);
  const isWarning = percentage >= 80;
  const isCritical = percentage >= 95;

  return (
    <div className="storage-usage-bar">
      <div className="storage-usage-header">
        <span className="storage-usage-label">Storage</span>
        <span className="storage-usage-text">
          {formatBytes(used)} / {formatBytes(limit)}
        </span>
      </div>
      <div className="storage-bar-track">
        <div
          className={`storage-bar-fill ${isCritical ? 'critical' : isWarning ? 'warning' : ''}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isWarning && (
        <p className={`storage-usage-warning ${isCritical ? 'critical' : ''}`}>
          {isCritical
            ? 'Storage almost full. Delete unused assets or upgrade your plan.'
            : 'Approaching storage limit.'}
        </p>
      )}
    </div>
  );
};

export default StorageUsageBar;
