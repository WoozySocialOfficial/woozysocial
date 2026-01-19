import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '@chakra-ui/react';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaReddit, FaTelegram, FaPinterest, FaCheck, FaTimes, FaEdit, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { FaTiktok, FaThreads } from 'react-icons/fa6';
import { SiX, SiBluesky } from 'react-icons/si';
import { CommentThread } from '../comments/CommentThread';
import { CommentInput } from '../comments/CommentInput';
import { baseURL } from '../../utils/constants';
import './CalendarPostModal.css';

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  twitter: SiX,
  'x/twitter': SiX,
  bluesky: SiBluesky,
  reddit: FaReddit,
  telegram: FaTelegram,
  pinterest: FaPinterest,
  threads: FaThreads
};

const STATUS_COLORS = {
  draft: '#6b7280',
  scheduled: '#3b82f6',
  pending_approval: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  changes_requested: '#f97316',
  posted: '#10b981',
  failed: '#ef4444'
};

export const CalendarPostModal = ({ posts, selectedDate, currentPostIndex, onClose, onPostUpdated }) => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const toast = useToast();
  const [currentIndex, setCurrentIndex] = useState(currentPostIndex || 0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const currentPost = posts[currentIndex];

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
        setComment('');
      } else if (e.key === 'ArrowRight' && currentIndex < posts.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setComment('');
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [currentIndex, posts.length, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

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

  const getStatusLabel = (status, approvalStatus) => {
    if (approvalStatus === 'rejected') return 'Rejected';
    if (approvalStatus === 'approved') return 'Approved';
    if (approvalStatus === 'changes_requested') return 'Changes Requested';
    if (status === 'pending_approval') return 'Pending Approval';

    const labels = {
      draft: 'Draft',
      scheduled: 'Scheduled',
      posted: 'Posted',
      failed: 'Failed'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status, approvalStatus) => {
    if (approvalStatus === 'rejected') return STATUS_COLORS.rejected;
    if (approvalStatus === 'approved') return STATUS_COLORS.approved;
    if (approvalStatus === 'changes_requested') return STATUS_COLORS.changes_requested;
    return STATUS_COLORS[status] || STATUS_COLORS.draft;
  };

  const getPlatformIcon = (platform) => {
    const IconComponent = PLATFORM_ICONS[platform.toLowerCase()];
    return IconComponent ? <IconComponent /> : null;
  };

  const handleApproval = async (action) => {
    if (!currentPost || !user) return;

    // Require comment for reject and changes_requested
    if ((action === 'reject' || action === 'changes_requested') && !comment.trim()) {
      toast({
        title: 'Comment required',
        description: `Please provide feedback when ${action === 'reject' ? 'rejecting' : 'requesting changes'}.`,
        status: 'warning',
        duration: 3000
      });
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch(`${baseURL}/api/post/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: currentPost.id,
          workspaceId: activeWorkspace.id,
          userId: user.id,
          action,
          comment: comment.trim() || undefined
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast({
          title: action === 'approve' ? 'Post Approved!' :
                 action === 'reject' ? 'Post Rejected' : 'Changes Requested',
          description: action === 'approve'
            ? 'The post has been approved and will be published.'
            : action === 'reject'
            ? 'The post has been rejected.'
            : 'Changes have been requested from the team.',
          status: action === 'approve' ? 'success' : 'info',
          duration: 3000
        });

        setComment('');

        // Call parent callback to refresh posts
        if (onPostUpdated) {
          onPostUpdated();
        }

        // Move to next post or close if last post
        if (currentIndex < posts.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else if (currentIndex > 0) {
          setCurrentIndex(currentIndex - 1);
        } else {
          onClose();
        }
      } else {
        throw new Error(data.error || 'Failed to process approval');
      }
    } catch (error) {
      console.error('Error processing approval:', error);
      toast({
        title: 'Error',
        description: error.message,
        status: 'error',
        duration: 3000
      });
    } finally {
      setSubmitting(false);
    }
  };

  const navigatePost = (direction) => {
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < posts.length) {
      setCurrentIndex(newIndex);
      setComment('');
    }
  };

  const canShowApprovalActions = () => {
    if (!currentPost) return false;
    const status = currentPost.approval_status || currentPost.status;
    return status === 'pending_approval' || status === 'pending' || status === 'changes_requested';
  };

  if (!currentPost) return null;

  return (
    <>
      {/* Overlay */}
      <div className="calendar-modal-overlay" onClick={onClose} />

      {/* Modal */}
      <div className="calendar-post-modal">
        {/* Header */}
        <div className="modal-header-bar">
          <div className="header-left">
            <h3>
              {selectedDate?.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
              })}
            </h3>
            <span className="post-counter">
              Post {currentIndex + 1} of {posts.length}
            </span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Navigation */}
        {posts.length > 1 && (
          <div className="modal-navigation">
            <button
              className="nav-arrow"
              onClick={() => navigatePost('prev')}
              disabled={currentIndex === 0}
              title="Previous post (←)"
            >
              <FaChevronLeft />
            </button>
            <button
              className="nav-arrow"
              onClick={() => navigatePost('next')}
              disabled={currentIndex === posts.length - 1}
              title="Next post (→)"
            >
              <FaChevronRight />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="modal-body-content">
          {/* Status Badge */}
          <div
            className="status-badge-modal"
            style={{ backgroundColor: getStatusColor(currentPost.status, currentPost.approval_status) }}
          >
            {getStatusLabel(currentPost.status, currentPost.approval_status)}
          </div>

          {/* Media Preview */}
          {(currentPost.media_urls?.length > 0 || currentPost.media_url) && (
            <div className="modal-media-section">
              <div className="media-grid-modal">
                {(currentPost.media_urls || [currentPost.media_url]).filter(Boolean).map((url, idx) => {
                  const isVideo = url?.match(/\.(mp4|mov|webm|avi)$/i);

                  if (isVideo) {
                    return (
                      <video
                        key={idx}
                        src={url}
                        controls
                        className="modal-video"
                      />
                    );
                  }

                  return (
                    <img
                      key={idx}
                      src={url}
                      alt={`Post media ${idx + 1}`}
                      className="modal-image"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Caption */}
          <div className="modal-section">
            <label className="section-label">Caption</label>
            <div className="post-caption-text">
              {currentPost.caption || currentPost.post || 'No caption provided'}
            </div>
          </div>

          {/* Platforms */}
          {currentPost.platforms && currentPost.platforms.length > 0 && (
            <div className="modal-section">
              <label className="section-label">Platforms</label>
              <div className="platforms-list-modal">
                {currentPost.platforms.map((platform) => (
                  <span key={platform} className="platform-chip-modal">
                    {getPlatformIcon(platform)}
                    <span>{platform}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scheduled Time */}
          <div className="modal-section">
            <label className="section-label">Scheduled For</label>
            <p className="scheduled-time-text">{formatDate(currentPost.schedule_date || currentPost.scheduled_at)}</p>
          </div>

          {/* Comments Section */}
          <div className="modal-section comments-section-modal">
            <label className="section-label">Comments & Feedback</label>
            <CommentThread
              postId={currentPost.id}
              workspaceId={currentPost.workspace_id || activeWorkspace?.id}
              enableRealtime={true}
            />
            <div className="comment-input-wrapper">
              <CommentInput
                postId={currentPost.id}
                workspaceId={currentPost.workspace_id || activeWorkspace?.id}
                showPrioritySelector={true}
              />
            </div>
          </div>

          {/* Approval Actions */}
          {canShowApprovalActions() && (
            <div className="modal-approval-section">
              <div className="feedback-input-section">
                <label className="section-label">
                  Your Feedback {comment.trim() ? '' : '(required for reject/changes)'}
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add your feedback or notes here..."
                  rows={3}
                  className="feedback-textarea"
                />
              </div>

              <div className="approval-actions-modal">
                <button
                  className="approval-btn-reject"
                  onClick={() => handleApproval('reject')}
                  disabled={submitting}
                >
                  <FaTimes /> Reject
                </button>
                <button
                  className="approval-btn-changes"
                  onClick={() => handleApproval('changes_requested')}
                  disabled={submitting}
                >
                  <FaEdit /> Request Changes
                </button>
                <button
                  className="approval-btn-approve"
                  onClick={() => handleApproval('approve')}
                  disabled={submitting}
                >
                  <FaCheck /> Approve
                </button>
              </div>
            </div>
          )}

          {/* Status Banner for Approved/Rejected */}
          {(currentPost.approval_status === 'approved' || currentPost.approval_status === 'rejected') && (
            <div className={`status-banner-modal ${currentPost.approval_status}`}>
              {currentPost.approval_status === 'approved' ? (
                <>
                  <FaCheck /> This post has been approved and scheduled
                </>
              ) : (
                <>
                  <FaTimes /> This post was rejected
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
