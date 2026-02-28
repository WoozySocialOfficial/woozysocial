import { useEffect, useState, useRef } from 'react';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaTiktok, FaEdit, FaTrash } from 'react-icons/fa';
import { SiX } from 'react-icons/si';
import { useToast } from '@chakra-ui/react';
import { CommentThread } from './CommentThread';
import { CommentInput } from './CommentInput';
import { AnalyticsSection } from '../analytics/AnalyticsSection';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { DeleteConfirmationModal } from '../modals/DeleteConfirmationModal';
import { useInvalidateQueries } from '../../hooks/useQueries';
import { formatPostError } from '../../utils/formatPostError';
import { baseURL } from '../../utils/constants';
import './PostDetailPanel.css';

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  twitter: SiX
};

const STATUS_COLORS = {
  draft: '#6b7280',
  scheduled: '#3b82f6',
  pending_approval: '#f59e0b',
  pending_internal: '#f59e0b',
  pending_client: '#8b5cf6',
  pending: '#f59e0b',
  changes_requested: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  posted: '#10b981',
  failed: '#ef4444'
};

export const PostDetailPanel = ({
  post,
  onClose,
  onApprove,
  onReject,
  onRequestChanges,
  onForwardToClient,
  showApprovalActions = false,
  actionLoading = false,
  onEditDraft,
  onEditScheduledPost,
  onDelete,
  dayPosts = [],
  currentIndex = 0,
  onNavigatePost
}) => {
  const { workspaceMembership, activeWorkspace, canApprove, hasFinalApproval } = useWorkspace();
  const { invalidatePosts } = useInvalidateQueries();
  const toast = useToast();
  const commentInputRef = useRef(null);
  const canDelete = workspaceMembership?.role === 'owner';

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Close on Escape key + arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
      if (onNavigatePost && dayPosts.length > 1) {
        if (e.key === 'ArrowLeft' && currentIndex > 0) {
          onNavigatePost(currentIndex - 1);
        }
        if (e.key === 'ArrowRight' && currentIndex < dayPosts.length - 1) {
          onNavigatePost(currentIndex + 1);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNavigatePost, dayPosts.length, currentIndex]);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getStatusLabel = (status) => {
    const labels = {
      draft: 'Draft',
      scheduled: 'Scheduled',
      pending_approval: 'Pending Approval',
      pending_internal: 'Pending Final Review',
      pending_client: 'Awaiting Client',
      pending: 'Pending Approval',
      changes_requested: 'Changes Requested',
      approved: 'Approved',
      rejected: 'Rejected',
      posted: 'Posted',
      failed: 'Failed'
    };
    return labels[status] || status;
  };

  const handleDelete = async (postToDelete, _deleteFromPlatforms) => {
    setIsDeleting(true);

    try {
      // Determine the post ID to use (Ayrshare post ID)
      const ayrPostId = postToDelete.ayr_post_id || postToDelete.id;

      if (!ayrPostId) {
        alert('Cannot delete: Post ID not found');
        setIsDeleting(false);
        return;
      }

      if (!activeWorkspace?.id) {
        alert('Cannot delete: Workspace not found');
        setIsDeleting(false);
        return;
      }

      // Call the delete API
      const response = await fetch(`${baseURL}/api/post/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          postId: ayrPostId,
          workspaceId: activeWorkspace.id,
          deleteFromDatabase: true
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Success - show message and close panel
        alert('✅ Post deleted successfully from social media and database');
        setShowDeleteModal(false);
        onClose();

        // Call the onDelete callback if provided
        if (onDelete) {
          onDelete(postToDelete.id);
        }

        // Invalidate cache to refresh the post list
        invalidatePosts(activeWorkspace.id);
      } else {
        // Error from API - show detailed error and DON'T close modal
        const errorMsg = data.data?.message || data.error || 'Failed to delete post';
        const detailedError = data.data?.ayrshareError
          ? `${errorMsg}\n\nDetails: ${JSON.stringify(data.data.ayrshareError)}`
          : errorMsg;

        alert(`❌ Delete Failed\n\n${detailedError}\n\nThe post was NOT deleted. Please try again or delete manually from the social platform.`);

        // Keep modal open so user can try again
        setIsDeleting(false);
        return; // Don't close modal or refresh
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('❌ Network Error\n\nFailed to delete post. Please check your connection and try again.');
      setIsDeleting(false);
      return; // Don't close modal
    }
  };

  // Handle approval actions that require a comment (Request Changes, Reject)
  const handleApprovalWithComment = (action) => {
    const commentText = commentInputRef.current?.getComment?.() || '';

    if (!commentText.trim()) {
      toast({
        title: 'Comment required',
        description: `Please enter your feedback in the comment field before ${action === 'reject' ? 'rejecting' : 'requesting changes to'} a post.`,
        status: 'warning',
        duration: 3000,
        isClosable: true
      });
      return;
    }

    // Clear the comment input after using the text
    commentInputRef.current?.clearComment?.();

    if (action === 'reject') {
      onReject(post.id, commentText.trim());
    } else {
      onRequestChanges(post.id, commentText.trim());
    }
  };

  return (
    <>
      {/* Overlay - click to close */}
      <div className="panel-overlay" onClick={onClose} />

      <div className="post-detail-panel">
        {/* Side navigation arrows */}
        {dayPosts.length > 1 && onNavigatePost && (
          <>
            <button
              className="panel-side-arrow panel-side-arrow-left"
              onClick={() => onNavigatePost(currentIndex - 1)}
              disabled={currentIndex === 0}
              title="Previous post (←)"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className="panel-side-arrow panel-side-arrow-right"
              onClick={() => onNavigatePost(currentIndex + 1)}
              disabled={currentIndex === dayPosts.length - 1}
              title="Next post (→)"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </>
        )}
        <div className="panel-header">
          <h3>Post Details</h3>
          {dayPosts.length > 1 && onNavigatePost && (
            <span className="panel-nav-count">{currentIndex + 1} / {dayPosts.length}</span>
          )}
          <button className="close-panel" onClick={onClose} title="Close (Esc)">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

      <div className="panel-content">
        {/* Status Badge + Edit Actions Row */}
        <div className="status-actions-row">
          <div
            className="status-badge"
            style={{ backgroundColor: STATUS_COLORS[post.status || post.approval_status] }}
          >
            {getStatusLabel(post.status || post.approval_status)}
          </div>

          {/* Edit Actions - Immediately Visible */}
          {post.status === 'draft' && onEditDraft && (
            <button className="btn-continue-editing-top" onClick={() => onEditDraft(post)}>
              <FaEdit size={14} />
              Continue Editing
            </button>
          )}
          {(post.status === 'scheduled' || post.status === 'pending_approval') && onEditScheduledPost && (
            <button className="btn-edit-post-top" onClick={() => onEditScheduledPost(post)}>
              <FaEdit size={14} />
              Edit Post
            </button>
          )}
        </div>

        {/* Failure reason */}
        {post.status === 'failed' && (post.last_error || post.lastError) && (
          <div className="failure-reason-box">
            <div className="failure-reason-label">Failure reason</div>
            <div className="failure-reason-message">{formatPostError(post.last_error || post.lastError)}</div>
          </div>
        )}

        {/* Caption */}
        <div className="detail-section">
          <label>Caption</label>
          <div className="post-caption">{post.caption || post.post || 'No caption'}</div>
        </div>

        {/* Media */}
        {(post.media_urls?.length > 0 || post.media_url) && (
          <div className="detail-section">
            <label>Media</label>
            <div className="media-grid">
              {(post.media_urls || [post.media_url]).filter(Boolean).map((url, idx) => {
                const isVideo = /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
                return isVideo ? (
                  <video key={idx} src={url} className="detail-media" controls muted />
                ) : (
                  <img key={idx} src={url} alt="Post media" className="detail-media" />
                );
              })}
            </div>
          </div>
        )}

        {/* Platforms */}
        {post.platforms && post.platforms.length > 0 && (
          <div className="detail-section">
            <label>Platforms</label>
            <div className="platforms-list">
              {post.platforms.map((platform) => {
                const Icon = PLATFORM_ICONS[platform.toLowerCase()] || FaInstagram;
                return (
                  <div key={platform} className="platform-chip">
                    <Icon size={16} />
                    <span>{platform}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Analytics Section - Only for posted posts */}
        {post.status === 'posted' && (post.ayr_post_id || post.id) && post.workspace_id && (
          <AnalyticsSection
            postId={post.ayr_post_id || post.id}
            workspaceId={post.workspace_id}
            platforms={post.platforms || []}
          />
        )}

        {/* Schedule Date */}
        {(post.scheduled_at || post.schedule_date) && (
          <div className="detail-section">
            <label>Scheduled For</label>
            <p>{formatDate(post.scheduled_at || post.schedule_date)}</p>
          </div>
        )}

        {/* Creator */}
        {post.created_by_name && (
          <div className="detail-section">
            <label>Created By</label>
            <p>{post.created_by_name}</p>
          </div>
        )}

        {/* Comments Section */}
        <div className="detail-section comments-section">
          <label>Comments & Feedback</label>
          <CommentThread
            postId={post.status === 'draft' ? undefined : post.id}
            draftId={post.status === 'draft' ? post.id : undefined}
            workspaceId={post.workspace_id}
            enableRealtime={true}
          />
          <CommentInput
            ref={commentInputRef}
            postId={post.status === 'draft' ? undefined : post.id}
            draftId={post.status === 'draft' ? post.id : undefined}
            workspaceId={post.workspace_id}
            showPrioritySelector={true}
          />
        </div>

        {/* Edit Actions for Drafts */}
        {post.status === 'draft' && onEditDraft && (
          <div className="edit-actions">
            <button className="btn-continue-editing" onClick={() => onEditDraft(post)}>
              <FaEdit size={16} />
              Continue Editing
            </button>
          </div>
        )}

        {/* Edit Actions for Scheduled Posts */}
        {(post.status === 'scheduled' || post.status === 'pending_approval') && onEditScheduledPost && (
          <div className="edit-actions">
            <button className="btn-edit-post" onClick={() => onEditScheduledPost(post)}>
              <FaEdit size={16} />
              Edit Post
            </button>
          </div>
        )}

        {/* Delete Action */}
        {canDelete && (post.status === 'posted' || post.status === 'scheduled' || post.status === 'failed') && (
          <div className="delete-actions">
            <button
              className="btn-delete-post"
              onClick={() => setShowDeleteModal(true)}
              title="Delete this post"
            >
              <FaTrash size={16} />
              Delete Post
            </button>
          </div>
        )}

        {/* Approval Actions - client approvers (pending / changes_requested) */}
        {showApprovalActions && canApprove && post.approval_status !== 'pending_internal' && (
          post.approval_status === 'pending' || post.approval_status === 'pending_client' || post.approval_status === 'changes_requested' || post.status === 'pending_approval'
        ) && (
          <div className="approval-actions">
            <button className="btn-reject" onClick={() => handleApprovalWithComment('reject')} disabled={actionLoading}>
              Reject
            </button>
            <button className="btn-changes" onClick={() => handleApprovalWithComment('changes_requested')} disabled={actionLoading}>
              Request Changes
            </button>
            <button className="btn-approve" onClick={() => onApprove(post.id)} disabled={actionLoading}>
              {actionLoading ? 'Processing...' : 'Approve'}
            </button>
          </div>
        )}

        {/* Gatekeeper Actions - final approvers reviewing pending_internal posts */}
        {showApprovalActions && hasFinalApproval && post.approval_status === 'pending_internal' && (
          <div className="approval-actions">
            <button className="btn-changes" onClick={() => handleApprovalWithComment('changes_requested')} disabled={actionLoading}>
              Request Changes
            </button>
            <button className="btn-forward" onClick={() => onForwardToClient && onForwardToClient(post.id)} disabled={actionLoading}>
              {actionLoading ? 'Processing...' : 'Forward to Client'}
            </button>
            <button className="btn-approve" onClick={() => onApprove(post.id)} disabled={actionLoading}>
              {actionLoading ? 'Processing...' : 'Approve Now'}
            </button>
          </div>
        )}
      </div>
    </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        post={post}
        isDeleting={isDeleting}
      />
    </>
  );
};
