import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { baseURL } from '../utils/constants';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaTiktok } from 'react-icons/fa';
import { SiX } from 'react-icons/si';
import './Approvals.css';

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  twitter: SiX
};

const STATUS_LABELS = {
  pending: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes Requested'
};

const STATUS_COLORS = {
  pending: '#6961f6',
  approved: '#2ecc71',
  rejected: '#e74c3c',
  changes_requested: '#f39c12'
};

export const Approvals = () => {
  const { user } = useAuth();
  const { activeWorkspace, workspaceMembership } = useWorkspace();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selectedPost, setSelectedPost] = useState(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const fetchPosts = async () => {
    if (!user || !activeWorkspace?.id) return;

    setLoading(true);
    try {
      const statusParam = filter === 'all' ? '' : `&status=${filter}`;
      const res = await fetch(
        `${baseURL}/api/post/pending-approvals?workspaceId=${activeWorkspace.id}&userId=${user.id}${statusParam}`
      );
      const data = await res.json();

      if (data.success) {
        // Handle both old format (data.posts) and new format (data.data.posts)
        const responseData = data.data || data;
        if (filter === 'all') {
          setPosts(responseData.posts || []);
        } else {
          setPosts(responseData.grouped?.[filter] || []);
        }
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async (postId) => {
    if (!postId) return;

    setLoadingComments(true);
    try {
      const res = await fetch(
        `${baseURL}/api/post/comment?postId=${postId}&workspaceId=${activeWorkspace.id}&userId=${user.id}`
      );
      const data = await res.json();
      if (data.success) {
        // Handle both old format (data.comments) and new format (data.data.comments)
        const responseData = data.data || data;
        setComments(responseData.comments || []);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [user, activeWorkspace, filter]);

  useEffect(() => {
    if (selectedPost) {
      fetchComments(selectedPost.id);
    }
  }, [selectedPost]);

  const handleApprovalAction = async (action) => {
    if (!selectedPost) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${baseURL}/api/post/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: selectedPost.id,
          workspaceId: activeWorkspace.id,
          userId: user.id,
          action: action,
          comment: comment || undefined
        })
      });

      const data = await res.json();

      if (data.success) {
        // Refresh posts
        fetchPosts();
        setSelectedPost(null);
        setComment('');
      }
    } catch (error) {
      console.error('Error updating approval:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedPost || !comment.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${baseURL}/api/post/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: selectedPost.id,
          workspaceId: activeWorkspace.id,
          userId: user.id,
          comment: comment.trim()
        })
      });

      const data = await res.json();

      if (data.success) {
        // Handle both old format (data.comment) and new format (data.data.comment)
        const responseData = data.data || data;
        setComments([...comments, responseData.comment]);
        setComment('');
      }
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="approvals-page">
      <div className="approvals-header">
        <div>
          <h1>Post Approvals</h1>
          <p>Review and approve scheduled posts for {activeWorkspace?.name}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="approval-filters">
        <button
          className={`filter-tab ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Pending
        </button>
        <button
          className={`filter-tab ${filter === 'changes_requested' ? 'active' : ''}`}
          onClick={() => setFilter('changes_requested')}
        >
          Changes Requested
        </button>
        <button
          className={`filter-tab ${filter === 'approved' ? 'active' : ''}`}
          onClick={() => setFilter('approved')}
        >
          Approved
        </button>
        <button
          className={`filter-tab ${filter === 'rejected' ? 'active' : ''}`}
          onClick={() => setFilter('rejected')}
        >
          Rejected
        </button>
      </div>

      <div className="approvals-content">
        {/* Posts List */}
        <div className="posts-list">
          {loading ? (
            <div className="loading-state">Loading posts...</div>
          ) : posts.length === 0 ? (
            <div className="empty-state">
              <p>No {filter === 'pending' ? 'posts pending approval' : `${filter} posts`}</p>
            </div>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className={`post-card ${selectedPost?.id === post.id ? 'selected' : ''}`}
                onClick={() => setSelectedPost(post)}
              >
                <div className="post-card-header">
                  <div className="post-platforms">
                    {post.platforms?.map((platform) => {
                      const Icon = PLATFORM_ICONS[platform.toLowerCase()] || FaInstagram;
                      return <Icon key={platform} className="platform-icon" />;
                    })}
                  </div>
                  <span
                    className="status-badge"
                    style={{ backgroundColor: STATUS_COLORS[post.approval_status] }}
                  >
                    {STATUS_LABELS[post.approval_status]}
                  </span>
                </div>

                <p className="post-preview">
                  {post.post?.substring(0, 120)}{post.post?.length > 120 ? '...' : ''}
                </p>

                {post.media_url && (
                  <div className="post-media-preview">
                    <img src={post.media_url} alt="Post media" />
                  </div>
                )}

                <div className="post-card-footer">
                  <span className="post-date">
                    Scheduled: {formatDate(post.schedule_date)}
                  </span>
                  {post.commentCount > 0 && (
                    <span className="comment-count">
                      {post.commentCount} comment{post.commentCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Selected Post Detail */}
        {selectedPost && (
          <div className="post-detail">
            <div className="detail-header">
              <h3>Post Details</h3>
              <button className="close-detail" onClick={() => setSelectedPost(null)}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="detail-content">
              <div className="detail-section">
                <label>Content</label>
                <div className="post-full-content">{selectedPost.post}</div>
              </div>

              {selectedPost.media_url && (
                <div className="detail-section">
                  <label>Media</label>
                  <img src={selectedPost.media_url} alt="Post media" className="detail-media" />
                </div>
              )}

              <div className="detail-section">
                <label>Platforms</label>
                <div className="detail-platforms">
                  {selectedPost.platforms?.map((platform) => (
                    <span key={platform} className="platform-tag">{platform}</span>
                  ))}
                </div>
              </div>

              <div className="detail-section">
                <label>Scheduled For</label>
                <p>{formatDate(selectedPost.schedule_date)}</p>
              </div>

              {/* Comments Section */}
              <div className="detail-section comments-section">
                <label>Comments & Feedback</label>
                <div className="comments-list">
                  {loadingComments ? (
                    <p className="loading-comments">Loading comments...</p>
                  ) : comments.length === 0 ? (
                    <p className="no-comments">No comments yet</p>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className={`comment ${c.is_system ? 'system-comment' : ''}`}>
                        <div className="comment-header">
                          <span className="comment-author">
                            {c.user_profiles?.full_name || c.user_profiles?.email || 'User'}
                          </span>
                          <span className="comment-time">
                            {new Date(c.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="comment-text">{c.comment}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Comment */}
                <div className="add-comment">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment or feedback..."
                    rows={3}
                  />
                  <button
                    className="btn-add-comment"
                    onClick={handleAddComment}
                    disabled={!comment.trim() || submitting}
                  >
                    Add Comment
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              {selectedPost.approval_status !== 'approved' && (
                <div className="approval-actions">
                  <button
                    className="btn-reject"
                    onClick={() => handleApprovalAction('reject')}
                    disabled={submitting}
                  >
                    Reject
                  </button>
                  <button
                    className="btn-changes"
                    onClick={() => handleApprovalAction('changes_requested')}
                    disabled={submitting}
                  >
                    Request Changes
                  </button>
                  <button
                    className="btn-approve"
                    onClick={() => handleApprovalAction('approve')}
                    disabled={submitting}
                  >
                    Approve
                  </button>
                </div>
              )}

              {selectedPost.approval_status === 'approved' && (
                <div className="approved-notice">
                  This post has been approved and will be published as scheduled.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Approvals;
