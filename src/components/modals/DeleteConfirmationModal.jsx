import { useState } from 'react';
import './DeleteConfirmationModal.css';

/**
 * DeleteConfirmationModal
 *
 * A reusable modal for confirming destructive delete actions.
 * Requires user to type the post caption or "DELETE" to confirm.
 *
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {function} onClose - Callback when modal is closed without deleting
 * @param {function} onConfirm - Callback when deletion is confirmed
 * @param {object} post - The post object to delete
 * @param {boolean} isDeleting - Whether the delete operation is in progress
 */
export const DeleteConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  post,
  isDeleting = false
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [deleteFromPlatforms, setDeleteFromPlatforms] = useState(true);

  if (!isOpen || !post) return null;

  // Get a short preview of the post caption
  const postPreview = (post.caption || post.post || 'this post').substring(0, 100);
  const requireText = 'DELETE';
  const canDelete = confirmText.toUpperCase() === requireText;

  const handleConfirm = () => {
    if (canDelete && !isDeleting) {
      onConfirm(post, deleteFromPlatforms);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && canDelete && !isDeleting) {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const formatPlatforms = () => {
    if (!post.platforms || post.platforms.length === 0) return 'social media';
    return post.platforms.join(', ');
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="delete-modal-overlay"
        onClick={!isDeleting ? onClose : undefined}
      />

      {/* Modal */}
      <div className="delete-modal">
        <div className="delete-modal-header">
          <div className="delete-icon-wrapper">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke="#EF4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2>Delete Post</h2>
        </div>

        <div className="delete-modal-content">
          <div className="warning-message">
            <strong>Warning:</strong> This action cannot be undone.
          </div>

          <div className="post-preview">
            <label>Post to delete:</label>
            <p className="preview-text">
              "{postPreview}{postPreview.length >= 100 ? '...' : ''}"
            </p>
          </div>

          <div className="delete-details">
            <p>This will delete the post from:</p>
            <ul>
              {deleteFromPlatforms && (
                <li>
                  <strong>{formatPlatforms()}</strong> (if published)
                </li>
              )}
              <li>Your WoozySocial database</li>
            </ul>
          </div>

          {/* Only show platform deletion option for posted/scheduled posts */}
          {(post.status === 'posted' || post.status === 'scheduled') && (
            <div className="delete-option">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={deleteFromPlatforms}
                  onChange={(e) => setDeleteFromPlatforms(e.target.checked)}
                  disabled={isDeleting}
                />
                <span>Also delete from social media platforms</span>
              </label>
              <p className="option-description">
                Unchecking this will only remove the post from your dashboard but leave it published on social media.
              </p>
            </div>
          )}

          <div className="confirmation-input">
            <label>
              Type <strong>{requireText}</strong> to confirm deletion:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={requireText}
              disabled={isDeleting}
              autoFocus
              className={canDelete ? 'valid' : ''}
            />
          </div>
        </div>

        <div className="delete-modal-actions">
          <button
            className="btn-cancel"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            className="btn-delete"
            onClick={handleConfirm}
            disabled={!canDelete || isDeleting}
          >
            {isDeleting ? (
              <>
                <span className="spinner"></span>
                Deleting...
              </>
            ) : (
              'Delete Post'
            )}
          </button>
        </div>
      </div>
    </>
  );
};
