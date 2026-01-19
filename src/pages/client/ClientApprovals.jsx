import React, { useState, useEffect } from "react";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useAuth } from "../../contexts/AuthContext";
import { usePendingApprovals, useInvalidateQueries } from "../../hooks/useQueries";
import { baseURL } from "../../utils/constants";
import { useToast } from "@chakra-ui/react";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaReddit, FaTelegram, FaPinterest, FaCheck, FaTimes, FaClock, FaEdit } from "react-icons/fa";
import { FaTiktok, FaThreads } from "react-icons/fa6";
import { SiX, SiBluesky } from "react-icons/si";
import "./ClientApprovals.css";

export const ClientApprovals = () => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const toast = useToast();
  const { invalidatePosts } = useInvalidateQueries();
  const [selectedPost, setSelectedPost] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Use React Query for cached data fetching
  const {
    data: posts = [],
    isLoading: loading,
    refetch: refetchPosts
  } = usePendingApprovals(activeWorkspace?.id, user?.id, activeTab);

  const tabs = [
    { id: "pending", label: "Pending", icon: FaClock },
    { id: "changes_requested", label: "Changes Requested", icon: FaEdit },
    { id: "approved", label: "Approved", icon: FaCheck },
    { id: "rejected", label: "Rejected", icon: FaTimes }
  ];

  // Auto-select first post when posts change
  useEffect(() => {
    if (posts.length > 0 && !selectedPost) {
      setSelectedPost(posts[0]);
    }
  }, [posts, selectedPost]);

  // Refresh function that invalidates cache
  const fetchPosts = () => {
    invalidatePosts(activeWorkspace?.id);
    refetchPosts();
  };

  const handleApproval = async (action) => {
    if (!selectedPost || !user) return;

    // Require comment for reject and changes_requested
    if ((action === 'reject' || action === 'changes_requested') && !comment.trim()) {
      toast({
        title: "Comment required",
        description: `Please provide feedback when ${action === 'reject' ? 'rejecting' : 'requesting changes'}.`,
        status: "warning",
        duration: 3000
      });
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch(`${baseURL}/api/post/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: selectedPost.id,
          workspaceId: activeWorkspace.id,
          userId: user.id,
          action,
          comment: comment.trim() || undefined
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast({
          title: action === 'approve' ? "Post Approved!" :
                 action === 'reject' ? "Post Rejected" : "Changes Requested",
          description: action === 'approve'
            ? "The post has been approved and will be published."
            : action === 'reject'
            ? "The post has been rejected."
            : "Changes have been requested from the team.",
          status: action === 'approve' ? "success" : "info",
          duration: 3000
        });

        // Refresh posts and clear selection
        setSelectedPost(null);
        setComment("");
        fetchPosts();
      } else {
        throw new Error(data.error || "Failed to process approval");
      }
    } catch (error) {
      console.error("Error processing approval:", error);
      toast({
        title: "Error",
        description: error.message,
        status: "error",
        duration: 3000
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Not scheduled";
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const PLATFORM_ICONS = {
    facebook: FaFacebookF,
    instagram: FaInstagram,
    linkedin: FaLinkedinIn,
    youtube: FaYoutube,
    tiktok: FaTiktok,
    twitter: SiX,
    "x/twitter": SiX,
    bluesky: SiBluesky,
    reddit: FaReddit,
    telegram: FaTelegram,
    pinterest: FaPinterest,
    threads: FaThreads
  };

  const getPlatformIcon = (platform) => {
    const IconComponent = PLATFORM_ICONS[platform.toLowerCase()];
    return IconComponent ? <IconComponent /> : null;
  };

  return (
    <div className="client-approvals">
      <div className="approvals-header">
        <h1>Post Approvals</h1>
        <p>Review and approve posts before they go live on your social media.</p>
      </div>

      {/* Tabs */}
      <div className="approvals-tabs">
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          return (
            <button
              key={tab.id}
              className={`approval-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedPost(null);
              }}
            >
              <span className="tab-icon"><IconComponent /></span>
              <span className="tab-label">{tab.label}</span>
              {tab.id === "pending" && posts.length > 0 && activeTab === "pending" && (
                <span className="tab-badge">{posts.length}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="approvals-content">
        {/* Posts List */}
        <div className="posts-list">
          {loading ? (
            <div className="loading-state">Loading posts...</div>
          ) : posts.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✨</span>
              <p>No {activeTab === "pending" ? "posts awaiting approval" :
                     activeTab === "changes_requested" ? "posts with changes requested" :
                     activeTab === "approved" ? "approved posts" :
                     "rejected posts"}</p>
            </div>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className={`post-item ${selectedPost?.id === post.id ? "selected" : ""}`}
                onClick={() => setSelectedPost(post)}
              >
                <div className="post-item-content">
                  <div className="post-caption">
                    {post.caption?.substring(0, 100) || "No caption"}
                    {post.caption?.length > 100 && "..."}
                  </div>
                  <div className="post-meta">
                    <span className="post-date">
                      📅 {formatDate(post.scheduled_at)}
                    </span>
                    <div className="post-platforms">
                      {post.platforms?.map((p) => (
                        <span key={p} className="platform-badge" title={p}>
                          {getPlatformIcon(p)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {post.media_urls?.length > 0 && (
                  <div className="post-thumbnail">
                    <img
                      src={post.media_urls[0]}
                      alt="Post media"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<span class="thumbnail-fallback">🖼️</span>';
                      }}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Post Detail */}
        <div className="post-detail">
          {selectedPost ? (
            <>
              <div className="detail-header">
                <h2>Post Preview</h2>
                <div className="detail-scheduled">
                  Scheduled: {formatDate(selectedPost.scheduled_at)}
                </div>
              </div>

              {/* Media Preview */}
              {selectedPost.media_urls?.length > 0 && (
                <div className="detail-media">
                  {selectedPost.media_urls.map((url, index) => {
                    // Check if it's a video
                    const isVideo = url?.match(/\.(mp4|mov|webm|avi)$/i);

                    if (isVideo) {
                      return (
                        <video
                          key={index}
                          src={url}
                          controls
                          className="media-preview-video"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling?.style && (e.target.nextSibling.style.display = 'flex');
                          }}
                        />
                      );
                    }

                    return (
                      <div key={index} className="media-preview-container">
                        <img
                          src={url}
                          alt={`Media ${index + 1}`}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentElement.classList.add('media-error');
                          }}
                        />
                        <div className="media-fallback">
                          <span className="media-fallback-icon">🖼️</span>
                          <span className="media-fallback-text">Media attached</span>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="media-fallback-link">
                            View media
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Caption */}
              <div className="detail-caption">
                <h3>Caption</h3>
                <p>{selectedPost.caption || "No caption provided"}</p>
              </div>

              {/* Platforms */}
              <div className="detail-platforms">
                <h3>Platforms</h3>
                <div className="platforms-list">
                  {selectedPost.platforms?.map((platform) => (
                    <span key={platform} className="platform-tag">
                      {getPlatformIcon(platform)} {platform}
                    </span>
                  ))}
                </div>
              </div>

              {/* Show status badge for approved/rejected posts */}
              {(selectedPost.approval_status === 'approved' || selectedPost.approval_status === 'rejected') && (
                <div className="detail-status">
                  <div className={`status-banner ${selectedPost.approval_status}`}>
                    {selectedPost.approval_status === 'approved' ?
                      <><FaCheck /> This post has been approved and scheduled</> :
                      <><FaTimes /> This post was rejected</>
                    }
                  </div>
                </div>
              )}

              {/* Comment Input - only for pending and changes_requested */}
              {(selectedPost.approval_status === 'pending' || selectedPost.approval_status === 'changes_requested') && (
                <>
                  <div className="detail-comment">
                    <h3>Feedback (optional for approval)</h3>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add your feedback or notes here..."
                      rows={3}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="detail-actions">
                    <button
                      className="action-btn approve"
                      onClick={() => handleApproval("approve")}
                      disabled={submitting}
                    >
                      <FaCheck /> Approve
                    </button>
                    <button
                      className="action-btn changes"
                      onClick={() => handleApproval("changes_requested")}
                      disabled={submitting}
                    >
                      <FaEdit /> Request Changes
                    </button>
                    <button
                      className="action-btn reject"
                      onClick={() => handleApproval("reject")}
                      disabled={submitting}
                    >
                      <FaTimes /> Reject
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="no-selection">
              <span className="no-selection-icon">👈</span>
              <p>Select a post from the list to review</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
