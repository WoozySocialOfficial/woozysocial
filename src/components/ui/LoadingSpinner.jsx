import './Loading.css';

/**
 * Unified LoadingSpinner component
 * Use this for all loading indicators across the app
 *
 * Sizes: 'sm' (16px), 'md' (32px), 'lg' (48px)
 * Variants: 'primary' (purple), 'secondary' (gray), 'white'
 */
export const LoadingSpinner = ({
  size = 'md',
  variant = 'primary',
  className = ''
}) => {
  const sizeClass = `spinner-${size}`;
  const variantClass = `spinner-${variant}`;

  return (
    <div
      className={`loading-spinner ${sizeClass} ${variantClass} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

/**
 * Loading container with spinner and optional message
 * Use for section-level loading states
 */
export const LoadingContainer = ({
  message = 'Loading...',
  size = 'md',
  className = ''
}) => {
  return (
    <div className={`loading-container ${className}`} role="status" aria-live="polite">
      <LoadingSpinner size={size} />
      {message && <p className="loading-message">{message}</p>}
    </div>
  );
};

/**
 * Full-screen loading overlay
 * Use for blocking operations (e.g., connecting accounts, processing payments)
 */
export const LoadingOverlay = ({
  message = 'Loading...',
  isVisible = true
}) => {
  if (!isVisible) return null;

  return (
    <div className="loading-overlay" role="dialog" aria-modal="true" aria-label={message}>
      <div className="loading-overlay-content">
        <LoadingSpinner size="lg" />
        <p className="loading-overlay-message">{message}</p>
      </div>
    </div>
  );
};

/**
 * Skeleton loader for content placeholders
 * Use for tables, cards, and content areas while loading
 */
export const SkeletonLoader = ({
  width = '100%',
  height = '20px',
  count = 1,
  className = '',
  variant = 'text' // 'text', 'circle', 'rect'
}) => {
  const items = Array.from({ length: count });

  return (
    <>
      {items.map((_, index) => (
        <div
          key={index}
          className={`skeleton skeleton-${variant} ${className}`}
          style={{
            width: typeof width === 'number' ? `${width}px` : width,
            height: typeof height === 'number' ? `${height}px` : height
          }}
        />
      ))}
    </>
  );
};

/**
 * Skeleton row for table/list loading states
 */
export const SkeletonRow = ({ columns = 4, className = '' }) => {
  return (
    <div className={`skeleton-row ${className}`}>
      {Array.from({ length: columns }).map((_, index) => (
        <SkeletonLoader key={index} height="16px" />
      ))}
    </div>
  );
};

/**
 * Skeleton card for card-based layouts
 */
export const SkeletonCard = ({ className = '' }) => {
  return (
    <div className={`skeleton-card ${className}`}>
      <SkeletonLoader height="120px" variant="rect" className="skeleton-card-image" />
      <div className="skeleton-card-content">
        <SkeletonLoader width="60%" height="18px" />
        <SkeletonLoader width="80%" height="14px" />
        <SkeletonLoader width="40%" height="14px" />
      </div>
    </div>
  );
};

/**
 * Table skeleton for data tables
 */
export const TableSkeleton = ({ rows = 5, columns = 4, className = '' }) => {
  return (
    <div className={`table-skeleton ${className}`}>
      <div className="skeleton-header">
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonLoader key={index} height="14px" width="80%" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <SkeletonRow key={rowIndex} columns={columns} />
      ))}
    </div>
  );
};

export default LoadingSpinner;
