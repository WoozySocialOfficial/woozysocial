import React, { useState, useEffect } from "react";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useAuth } from "../../contexts/AuthContext";
import { baseURL } from "../../utils/constants";
import { useToast } from "@chakra-ui/react";
import "./ClientApprovals.css";

export const ClientApprovals = () => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const tabs = [
    { id: "pending", label: "Pending", icon: "⏳" },
    { id: "changes_requested", label: "Changes Requested", icon: "📝" }
  ];

  useEffect(() => {
    fetchPosts();
  }, [activeWorkspace, activeTab]);

  const fetchPosts = async () => {
    if (!activeWorkspace) return;

    try {
      setLoading(true);
      const res = await fetch(
        `${baseURL}/api/post/pending-approvals?workspaceId=${activeWorkspace.id}&status=${activeTab}`
      );

      if (res.ok) {
        const data = await res.json();
        // Handle both old format (data.grouped) and new format (data.data.grouped)
        const responseData = data.data || data;
        const filteredPosts = responseData.grouped?.[activeTab] || [];
        setPosts(filteredPosts);

        // Auto-select first post if none selected
        if (filteredPosts.length > 0 && !selectedPost) {
          setSelectedPost(filteredPosts[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
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

  const getPlatformIcon = (platform) => {
    const icons = {
      instagram: "📸",
      facebook: "📘",
      twitter: "🐦",
      linkedin: "💼",
      tiktok: "🎵",
      youtube: "📺",
      pinterest: "📌",
      threads: "🧵"
    };
    return icons[platform.toLowerCase()] || "📱";
  };

  return (
    <div className="client-approvals">
      <div className="approvals-header">
        <h1>Post Approvals</h1>
        <p>Review and approve posts before they go live on your social media.</p>
      </div>

      {/* Tabs */}
      <div className="approvals-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`approval-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => {
              setActiveTab(tab.id);
              setSelectedPost(null);
            }}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {tab.id === "pending" && posts.length > 0 && activeTab === "pending" && (
              <span className="tab-badge">{posts.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="approvals-content">
        {/* Posts List */}
        <div className="posts-list">
          {loading ? (
            <div className="loading-state">Loading posts...</div>
          ) : posts.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✨</span>
              <p>No posts {activeTab === "pending" ? "awaiting approval" : "with requested changes"}</p>
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
                    <img src={post.media_urls[0]} alt="Post media" />
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
                  {selectedPost.media_urls.map((url, index) => (
                    <img key={index} src={url} alt={`Media ${index + 1}`} />
                  ))}
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

              {/* Comment Input */}
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
                  ✅ Approve
                </button>
                <button
                  className="action-btn changes"
                  onClick={() => handleApproval("changes_requested")}
                  disabled={submitting}
                >
                  📝 Request Changes
                </button>
                <button
                  className="action-btn reject"
                  onClick={() => handleApproval("reject")}
                  disabled={submitting}
                >
                  ❌ Reject
                </button>
              </div>
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
