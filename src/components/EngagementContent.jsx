import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaReddit, FaTelegram, FaReply, FaTrash, FaSyncAlt } from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { SiX, SiBluesky } from "react-icons/si";
import { LoadingContainer } from "./ui/LoadingSpinner";
import "./EngagementContent.css";

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  reddit: FaReddit,
  telegram: FaTelegram,
  tiktok: FaTiktok,
  twitter: SiX,
  "x/twitter": SiX,
  bluesky: SiBluesky,
};

export const EngagementContent = () => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch posts from Ayrshare
  const fetchPosts = useCallback(async () => {
    if (!user || !activeWorkspace) return;

    setLoading(true);
    try {
      const response = await fetch(`${baseURL}/api/post-history?workspaceId=${activeWorkspace.id}`);
      if (!response.ok) throw new Error("Failed to fetch posts");

      const data = await response.json();
      // Handle both old format (data.history) and new format (data.data.history)
      const responseData = data.data || data;
      const publishedPosts = (responseData.history || []).filter(post => post.status === "success");
      setPosts(publishedPosts);

      // Auto-select first post if available
      if (publishedPosts.length > 0 && !selectedPost) {
        setSelectedPost(publishedPosts[0]);
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [user, activeWorkspace, selectedPost]);

  // Fetch comments for selected post
  const fetchComments = useCallback(async () => {
    if (!selectedPost || !activeWorkspace) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${baseURL}/api/comments/${selectedPost.id}?workspaceId=${activeWorkspace.id}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          setComments([]);
          return;
        }
        throw new Error("Failed to fetch comments");
      }

      const data = await response.json();
      // Handle both old format (data.comments) and new format (data.data.comments)
      const responseData = data.data || data;
      setComments(responseData.comments || []);
    } catch (error) {
      console.error("Error fetching comments:", error);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPost, activeWorkspace]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (selectedPost) {
      fetchComments();
    }
  }, [selectedPost, fetchComments]);

  const handlePostSelect = (post) => {
    setSelectedPost(post);
    setReplyingTo(null);
    setReplyText("");
  };

  const handleReply = async (commentId) => {
    if (!replyText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const endpoint = commentId
        ? `${baseURL}/api/comments/reply/${commentId}`
        : `${baseURL}/api/comments`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          postId: selectedPost.id,
          [commentId ? "reply" : "comment"]: replyText,
          platform: selectedPost.platforms?.[0] || "facebook"
        })
      });

      if (!response.ok) throw new Error("Failed to post reply");

      // Clear input and refresh comments
      setReplyText("");
      setReplyingTo(null);
      await fetchComments();
    } catch (error) {
      console.error("Error posting reply:", error);
      alert("Failed to post reply: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm("Delete this comment?")) return;

    try {
      const response = await fetch(
        `${baseURL}/api/comments/${commentId}?workspaceId=${activeWorkspace.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to delete comment");

      await fetchComments();
    } catch (error) {
      console.error("Error deleting comment:", error);
      alert("Failed to delete comment: " + error.message);
    }
  };

  const getPlatformIcon = (platform) => {
    const Icon = PLATFORM_ICONS[platform?.toLowerCase()] || FaFacebookF;
    return <Icon className="platform-icon" />;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="engagement-content">
      <div className="engagement-header">
        <h2>Engagement & Comments</h2>
        <button onClick={fetchComments} className="refresh-button" disabled={loading}>
          <FaSyncAlt className={loading ? 'spinning' : ''} size={20} />
        </button>
      </div>

      <div className="engagement-container">
        {/* Left Sidebar - Posts List */}
        <div className="posts-sidebar">
          <h3>Recent Posts</h3>
          {loading && posts.length === 0 ? (
            <LoadingContainer message="Loading posts..." size="sm" />
          ) : posts.length === 0 ? (
            <div className="empty-state">No published posts yet</div>
          ) : (
            <div className="posts-list">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className={`post-item ${selectedPost?.id === post.id ? 'active' : ''}`}
                  onClick={() => handlePostSelect(post)}
                >
                  <div className="post-item-content">
                    {(post.post || "").substring(0, 60)}
                    {(post.post || "").length > 60 && "..."}
                  </div>
                  <div className="post-item-meta">
                    <span className="post-date">{formatDate(post.postDate)}</span>
                    <div className="post-platforms">
                      {post.platforms?.map((platform, idx) => (
                        <span key={idx} className="platform-badge">
                          {getPlatformIcon(platform)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Content - Comments */}
        <div className="comments-section">
          {!selectedPost ? (
            <div className="empty-state">Select a post to view comments</div>
          ) : (
            <>
              <div className="selected-post-header">
                <h3>Post Comments</h3>
                <p className="post-preview">{selectedPost.post}</p>
              </div>

              {loading ? (
                <LoadingContainer message="Loading comments..." size="sm" />
              ) : comments.length === 0 ? (
                <div className="empty-state">
                  <p>No comments yet on this post</p>
                  <small>Comments from Facebook and Instagram will appear here</small>
                </div>
              ) : (
                <div className="comments-list">
                  {comments.map((comment) => (
                    <div key={comment.id} className="comment-item">
                      <div className="comment-header">
                        <div className="comment-author">
                          <strong>{comment.from?.name || "Anonymous"}</strong>
                          {getPlatformIcon(comment.platform)}
                        </div>
                        <div className="comment-actions">
                          <button
                            className="action-btn reply-btn"
                            onClick={() => setReplyingTo(comment.id)}
                            title="Reply to comment"
                          >
                            <FaReply size={14} />
                          </button>
                          <button
                            className="action-btn delete-btn"
                            onClick={() => handleDeleteComment(comment.id)}
                            title="Delete comment"
                          >
                            <FaTrash size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="comment-text">{comment.message}</div>
                      <div className="comment-meta">
                        {formatDate(comment.created_time)}
                      </div>

                      {/* Reply Form */}
                      {replyingTo === comment.id && (
                        <div className="reply-form">
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write your reply..."
                            rows={3}
                          />
                          <div className="reply-actions">
                            <button
                              onClick={() => setReplyingTo(null)}
                              className="btn-cancel"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleReply(comment.id)}
                              className="btn-reply"
                              disabled={!replyText.trim() || isSubmitting}
                            >
                              {isSubmitting ? "Posting..." : "Post Reply"}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Nested Replies */}
                      {comment.comments && comment.comments.length > 0 && (
                        <div className="nested-comments">
                          {comment.comments.map((reply) => (
                            <div key={reply.id} className="reply-item">
                              <div className="reply-header">
                                <strong>{reply.from?.name || "You"}</strong>
                                <span className="reply-date">{formatDate(reply.created_time)}</span>
                              </div>
                              <div className="reply-text">{reply.message}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add Comment Form */}
              <div className="add-comment-section">
                <h4>Add a Comment</h4>
                <textarea
                  value={replyingTo === null ? replyText : ""}
                  onChange={(e) => {
                    if (replyingTo === null) setReplyText(e.target.value);
                  }}
                  placeholder="Write a comment on this post..."
                  rows={4}
                  disabled={replyingTo !== null}
                />
                <button
                  onClick={() => handleReply(null)}
                  className="btn-post-comment"
                  disabled={!replyText.trim() || isSubmitting || replyingTo !== null}
                >
                  {isSubmitting ? "Posting..." : "Post Comment"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
