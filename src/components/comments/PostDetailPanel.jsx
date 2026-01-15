import React, { useEffect } from 'react';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaTiktok, FaEdit } from 'react-icons/fa';
import { SiX } from 'react-icons/si';
import { CommentThread } from './CommentThread';
import { CommentInput } from './CommentInput';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useNavigate } from 'react-router-dom';
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
  showApprovalActions = false,
  onEditDraft,
  onEditScheduledPost
}) => {
  const { workspaceMembership } = useWorkspace();
  const navigate = useNavigate();
  const canApprove = ['owner', 'admin', 'client'].includes(workspaceMembership?.role);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

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
      approved: 'Approved',
      rejected: 'Rejected',
      posted: 'Posted',
      failed: 'Failed'
    };
    return labels[status] || status;
  };

  return (
    <>
      {/* Overlay - click to close */}
      <div className="panel-overlay" onClick={onClose} />

      <div className="post-detail-panel">
        <div className="panel-header">
          <h3>Post Details</h3>
          <button className="close-panel" onClick={onClose} title="Close (Esc)">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

      <div className="panel-content">
        {/* Status Badge */}
        <div
          className="status-badge"
          style={{ backgroundColor: STATUS_COLORS[post.status || post.approval_status] }}
        >
          {getStatusLabel(post.status || post.approval_status)}
        </div>

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
              {(post.media_urls || [post.media_url]).filter(Boolean).map((url, idx) => (
                <img key={idx} src={url} alt="Post media" className="detail-media" />
              ))}
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

        {/* Approval Actions */}
        {showApprovalActions && canApprove && (
          post.approval_status === 'pending' || post.status === 'pending_approval'
        ) && (
          <div className="approval-actions">
            <button className="btn-reject" onClick={() => onReject(post.id)}>
              Reject
            </button>
            <button className="btn-changes" onClick={() => onRequestChanges(post.id)}>
              Request Changes
            </button>
            <button className="btn-approve" onClick={() => onApprove(post.id)}>
              Approve
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
};
