import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@chakra-ui/react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import RoleGuard from '../components/roles/RoleGuard';
import { baseURL } from '../utils/constants';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaTiktok, FaShieldAlt, FaClock, FaEdit, FaCheck, FaTimes, FaCheckCircle, FaArrowRight, FaUser } from 'react-icons/fa';
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
  pending_internal: 'Pending Review',           // NEW
  pending_client: 'Awaiting Client',              // NEW
  pending: 'Pending Approval',                    // LEGACY
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes Requested'
};

const STATUS_COLORS = {
  pending_internal: '#ff9800',    // Orange
  pending_client: '#9c27b0',        // Purple
  pending: '#afabf9',               // Light purple (legacy)
  approved: '#2ecc71',              // Green
  rejected: '#e74c3c',              // Red
  changes_requested: '#f39c12'      // Amber
};

export const Approvals = () => {
  const { user } = useAuth();
  const { activeWorkspace, workspaceMembership, canApprovePost, hasFinalApproval, canApprove } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selectedPost, setSelectedPost] = useState(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const postRefs = useRef({});
  const processedUrlPostIds = useRef(new Set());
  const toast = useToast();

  // Get postId from URL query params
  const urlPostId = searchParams.get('postId');

  const fetchPosts = useCallback(async () => {
    if (!user?.id || !activeWorkspace?.id) return;

    setLoading(true);
    try {
      const statusParam = filter === 'all' ? '' : `&status=${filter}`;
      const res = await fetch(
        `${baseURL}/api/post/pending-approvals?workspaceId=${activeWorkspace.id}&userId=${user.id}${statusParam}`
      );

      if (!res.ok) {
        throw new Error('Failed to fetch posts');
      }

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
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeWorkspace?.id, filter]);

  const fetchComments = useCallback(async (postId) => {
    if (!postId || !activeWorkspace?.id || !user?.id) return;

    setLoadingComments(true);
    try {
      const res = await fetch(
        `${baseURL}/api/post/comment?postId=${postId}&workspaceId=${activeWorkspace.id}&userId=${user.id}`
      );

      if (!res.ok) {
        throw new Error('Failed to fetch comments');
      }

      const data = await res.json();
      if (data.success) {
        // Handle both old format (data.comments) and new format (data.data.comments)
        const responseData = data.data || data;
        setComments(responseData.comments || []);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }, [activeWorkspace?.id, user?.id]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (selectedPost?.id) {
      fetchComments(selectedPost.id);
    }
  }, [selectedPost?.id, fetchComments]);

  // Handle postId from URL - find and highlight the specific post
  useEffect(() => {
    const findAndSelectPost = async () => {
      if (!urlPostId || !user?.id || !activeWorkspace?.id) return;

      // Prevent processing the same postId multiple times
      if (processedUrlPostIds.current.has(urlPostId)) return;
      processedUrlPostIds.current.add(urlPostId);

      // Fetch all posts to find the one with this ID
      try {
        const res = await fetch(
          `${baseURL}/api/post/pending-approvals?workspaceId=${activeWorkspace.id}&userId=${user.id}`
        );

        if (!res.ok) return;

        const data = await res.json();
        if (!data.success) return;

        const responseData = data.data || data;
        const grouped = responseData.grouped || {};

        // Search through all status groups
        let foundPost = null;
        let foundStatus = null;

        for (const [status, statusPosts] of Object.entries(grouped)) {
          const post = statusPosts?.find(p => p.id === urlPostId);
          if (post) {
            foundPost = post;
            foundStatus = status;
            break;
          }
        }

        if (foundPost && foundStatus) {
          // Switch to the correct filter if needed
          const needsTabSwitch = foundStatus !== filter;
          if (needsTabSwitch) {
            setFilter(foundStatus);
          }

          // Wait for posts to load after filter change
          // If we switched tabs, wait longer for fetch to complete
          const waitTime = needsTabSwitch ? 800 : 300;

          setTimeout(() => {
            // Check if post is available in posts array
            const checkAndScroll = () => {
              setSelectedPost(foundPost);
              setHighlightedPostId(foundPost.id);

              // Scroll to the post
              if (postRefs.current[foundPost.id]) {
                postRefs.current[foundPost.id].scrollIntoView({
                  behavior: 'smooth',
                  block: 'center'
                });
              } else {
                // Post not in DOM yet, retry
                setTimeout(checkAndScroll, 200);
              }
            };

            checkAndScroll();

            // Remove highlight after animation
            setTimeout(() => {
              setHighlightedPostId(null);
              // Clear the URL param
              setSearchParams({});
              // Allow the same postId to be processed again later
              processedUrlPostIds.current.delete(urlPostId);
            }, 3000);
          }, waitTime);
        }
      } catch (error) {
        console.error('Error finding post:', error);
        processedUrlPostIds.current.delete(urlPostId); // Clear on error
      }
    };

    findAndSelectPost();
  }, [urlPostId, user?.id, activeWorkspace?.id, setSearchParams]);

  const handleApprovalAction = async (action) => {
    if (!selectedPost || !activeWorkspace?.id || !user?.id) return;

    // Require comment for reject and changes_requested actions
    if ((action === 'reject' || action === 'changes_requested') && !comment.trim()) {
      toast({
        title: 'Comment required',
        description: `Please provide feedback when ${action === 'reject' ? 'rejecting' : 'requesting changes to'} a post.`,
        status: 'warning',
        duration: 3000,
        isClosable: true
      });
      return;
    }

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

      if (!res.ok) {
        throw new Error('Failed to update approval');
      }

      const data = await res.json();

      if (data.success) {
        // Show success toast with action-specific message
        const actionMessages = {
          'approve': 'Post approved successfully!',
          'reject': 'Post rejected',
          'changes_requested': 'Changes requested from creator',
          'mark_resolved': 'Post marked as resolved and resubmitted',
          'forward_to_client': '✓ Forwarded to client for their review'
        };

        toast({
          title: actionMessages[action] || 'Action completed',
          description: action === 'forward_to_client'
            ? 'The post has been moved to the client approval queue'
            : undefined,
          status: 'success',
          duration: 4000,
          isClosable: true,
          position: 'top'
        });

        // Refresh posts
        fetchPosts();
        setSelectedPost(null);
        setComment('');
      }
    } catch (error) {
      console.error('Error updating approval:', error);
      toast({
        title: 'Action failed',
        description: error.message || 'Failed to update approval status',
        status: 'error',
        duration: 4000,
        isClosable: true
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedPost || !comment.trim() || !activeWorkspace?.id || !user?.id) return;

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

      if (!res.ok) {
        throw new Error('Failed to add comment');
      }

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
        {/* Final Approver tab - only for final approvers */}
        {hasFinalApproval && (
          <button
            className={`filter-tab ${filter === 'pending_internal' ? 'active' : ''}`}
            onClick={() => setFilter('pending_internal')}
          >
            <FaShieldAlt style={{ marginRight: '8px' }} />
            Pending Review
            {posts.filter(p => p.approval_status === 'pending_internal').length > 0 && (
              <span className="filter-badge">{posts.filter(p => p.approval_status === 'pending_internal').length}</span>
            )}
          </button>
        )}

        {/* Client approval tab - only for client approvers */}
        {canApprove && (
          <button
            className={`filter-tab ${filter === 'pending_client' ? 'active' : ''}`}
            onClick={() => setFilter('pending_client')}
          >
            <FaClock style={{ marginRight: '8px' }} />
            Awaiting Client
            {posts.filter(p => p.approval_status === 'pending_client').length > 0 && (
              <span className="filter-badge">{posts.filter(p => p.approval_status === 'pending_client').length}</span>
            )}
          </button>
        )}

        {/* Legacy pending tab - for backward compatibility */}
        {(hasFinalApproval || canApprove) && (
          <button
            className={`filter-tab ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending
            {posts.filter(p => p.approval_status === 'pending').length > 0 && (
              <span className="filter-badge">{posts.filter(p => p.approval_status === 'pending').length}</span>
            )}
          </button>
        )}

        {/* Changes Requested tab - for all approvers */}
        {(hasFinalApproval || canApprove) && (
          <button
            className={`filter-tab ${filter === 'changes_requested' ? 'active' : ''}`}
            onClick={() => setFilter('changes_requested')}
          >
            <FaEdit style={{ marginRight: '8px' }} />
            Changes Requested
            {posts.filter(p => p.approval_status === 'changes_requested').length > 0 && (
              <span className="filter-badge">{posts.filter(p => p.approval_status === 'changes_requested').length}</span>
            )}
          </button>
        )}

        <button
          className={`filter-tab ${filter === 'approved' ? 'active' : ''}`}
          onClick={() => setFilter('approved')}
        >
          <FaCheck style={{ marginRight: '8px' }} />
          Approved
        </button>

        <button
          className={`filter-tab ${filter === 'rejected' ? 'active' : ''}`}
          onClick={() => setFilter('rejected')}
        >
          <FaTimes style={{ marginRight: '8px' }} />
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
              <p>No {
                filter === 'pending_internal' ? 'posts pending internal review' :
                filter === 'pending_client' ? 'posts awaiting client approval' :
                filter === 'pending' ? 'posts pending approval' :
                filter === 'changes_requested' ? 'posts with changes requested' :
                filter === 'approved' ? 'approved posts' :
                filter === 'rejected' ? 'rejected posts' :
                'posts'
              }</p>
            </div>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                ref={(el) => postRefs.current[post.id] = el}
                className={`post-card ${selectedPost?.id === post.id ? 'selected' : ''} ${highlightedPostId === post.id ? 'highlighted' : ''}`}
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
                    {/\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(post.media_url) ? (
                      <video src={post.media_url} controls style={{ maxWidth: '100%', borderRadius: '8px' }} />
                    ) : (
                      <img src={post.media_url} alt="Post media" />
                    )}
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
                  {/\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(selectedPost.media_url) ? (
                    <video src={selectedPost.media_url} controls className="detail-media" style={{ maxWidth: '100%', borderRadius: '8px' }} />
                  ) : (
                    <img src={selectedPost.media_url} alt="Post media" className="detail-media" />
                  )}
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

              {/* Status Notice */}
              <div
                className="status-notice"
                style={{
                  backgroundColor: `${STATUS_COLORS[selectedPost.approval_status]}15`,
                  borderColor: STATUS_COLORS[selectedPost.approval_status],
                  color: STATUS_COLORS[selectedPost.approval_status]
                }}
              >
                Status: {STATUS_LABELS[selectedPost.approval_status]}
              </div>

              {/* Final Approver Actions - for pending_internal posts */}
              {selectedPost.approval_status === 'pending_internal' && hasFinalApproval && (
                <div className="approval-actions">
                  <div className="action-section-header">
                    <FaShieldAlt style={{ marginRight: '8px' }} />
                    <span>Final Approver Actions</span>
                  </div>
                  <div className="action-buttons">
                    <button
                      className="btn-reject"
                      onClick={() => handleApprovalAction('changes_requested')}
                      disabled={submitting}
                      title="Request changes from creator"
                    >
                      <FaEdit style={{ marginRight: '6px' }} />
                      Request Changes
                    </button>
                    <button
                      className="btn-forward"
                      onClick={() => handleApprovalAction('forward_to_client')}
                      disabled={submitting}
                      title="Forward to client for approval"
                    >
                      <FaArrowRight style={{ marginRight: '6px' }} />
                      Forward to Client
                    </button>
                    <button
                      className="btn-approve"
                      onClick={() => handleApprovalAction('approve')}
                      disabled={submitting}
                      title="Approve immediately (bypasses client)"
                    >
                      <FaCheck style={{ marginRight: '6px' }} />
                      Approve Now
                    </button>
                  </div>
                  <p className="action-help-text">
                    ℹ️ You can approve this post directly or forward it to the client for their review.
                  </p>
                </div>
              )}

              {/* Client Approval Actions - for pending_client and pending posts */}
              {(selectedPost.approval_status === 'pending_client' || selectedPost.approval_status === 'pending') && canApprove && (
                <div className="approval-actions">
                  <div className="action-section-header">
                    <FaUser style={{ marginRight: '8px' }} />
                    <span>Client Actions</span>
                  </div>
                  <div className="action-buttons">
                    <button
                      className="btn-reject"
                      onClick={() => handleApprovalAction('reject')}
                      disabled={submitting}
                    >
                      <FaTimes style={{ marginRight: '6px' }} />
                      Reject
                    </button>
                    <button
                      className="btn-changes"
                      onClick={() => handleApprovalAction('changes_requested')}
                      disabled={submitting}
                    >
                      <FaEdit style={{ marginRight: '6px' }} />
                      Request Changes
                    </button>
                    <button
                      className="btn-approve"
                      onClick={() => handleApprovalAction('approve')}
                      disabled={submitting}
                    >
                      <FaCheck style={{ marginRight: '6px' }} />
                      Approve
                    </button>
                  </div>
                </div>
              )}

              {/* Mark Resolved Action - for changes_requested posts */}
              {selectedPost.approval_status === 'changes_requested' && (
                <div className="approval-actions">
                  <div className="action-section-header">
                    <FaCheckCircle style={{ marginRight: '8px' }} />
                    <span>Resolve Changes</span>
                  </div>
                  <div className="action-buttons">
                    <button
                      className="btn-resolve"
                      onClick={() => handleApprovalAction('mark_resolved')}
                      disabled={submitting}
                    >
                      <FaCheckCircle style={{ marginRight: '6px' }} />
                      Mark Resolved
                    </button>
                  </div>
                  <p className="action-help-text">
                    Mark this post as resolved to resubmit for approval.
                  </p>
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
