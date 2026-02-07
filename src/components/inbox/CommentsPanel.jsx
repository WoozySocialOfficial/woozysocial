import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { baseURL } from "../../utils/constants";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaReply, FaTrash, FaSyncAlt } from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { SiX, SiBluesky } from "react-icons/si";
import { LoadingContainer } from "../ui/LoadingSpinner";

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  twitter: SiX,
  "x/twitter": SiX,
  bluesky: SiBluesky,
};

export const CommentsPanel = ({ onRefresh }) => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPosts = useCallback(async () => {
    if (!user || !activeWorkspace) return;

    setLoading(true);
    try {
      const response = await fetch(`${baseURL}/api/post-history?workspaceId=${activeWorkspace.id}`);
      if (!response.ok) throw new Error("Failed to fetch posts");

      const data = await response.json();
      const responseData = data.data || data;
      const publishedPosts = (responseData.history || []).filter(post => post.status === "success");
      setPosts(publishedPosts);

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

  // Ayrshare history posts have the ID at .id, DB posts at .ayr_post_id
  const getAyrPostId = useCallback((post) => {
    return post?.ayr_post_id || post?.id;
  }, []);

  const syncComments = useCallback(async () => {
    if (!selectedPost || !activeWorkspace) return;
    const ayrPostId = getAyrPostId(selectedPost);
    if (!ayrPostId) return;

    try {
      const response = await fetch(`${baseURL}/api/sync-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: ayrPostId,
          workspaceId: activeWorkspace.id
        })
      });

      if (response.ok) {
        await response.json();
      }
    } catch (error) {
      console.error('Error syncing comments:', error);
    }
  }, [selectedPost, activeWorkspace, getAyrPostId]);

  const fetchComments = useCallback(async () => {
    if (!selectedPost || !activeWorkspace) return;
    const ayrPostId = getAyrPostId(selectedPost);

    setLoading(true);
    try {
      await syncComments();

      const response = await fetch(
        `${baseURL}/api/comments/${ayrPostId}?workspaceId=${activeWorkspace.id}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          setComments([]);
          return;
        }
        throw new Error("Failed to fetch comments");
      }

      const data = await response.json();
      const responseData = data.data || data;
      setComments(responseData.comments || []);
    } catch (error) {
      console.error("Error fetching comments:", error);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPost, activeWorkspace, syncComments]);

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
      const ayrPostId = getAyrPostId(selectedPost);
      const endpoint = commentId
        ? `${baseURL}/api/comments/reply/${commentId}`
        : `${baseURL}/api/comments`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          postId: ayrPostId,
          [commentId ? "reply" : "comment"]: replyText,
          platform: selectedPost.platforms?.[0] || "facebook"
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.error || errData?.data?.error || "Failed to post comment";
        throw new Error(errMsg);
      }

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
    return <Icon className="cp-platform-icon" />;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="unified-inbox-grid">
      {/* Left Sidebar - Posts List */}
      <div className="cp-posts-sidebar">
        <div className="cp-sidebar-header">
          <h3>Recent Posts</h3>
          <button onClick={fetchComments} className="cp-sync-btn" disabled={loading} title="Sync comments">
            <FaSyncAlt className={loading ? 'spinning' : ''} size={14} />
          </button>
        </div>
        {loading && posts.length === 0 ? (
          <LoadingContainer message="Loading posts..." size="sm" />
        ) : posts.length === 0 ? (
          <div className="unified-empty-state">No published posts yet</div>
        ) : (
          <div className="cp-posts-list">
            {posts.map((post) => (
              <div
                key={post.id}
                className={`cp-post-item ${selectedPost?.id === post.id ? 'active' : ''}`}
                onClick={() => handlePostSelect(post)}
              >
                <div className="cp-post-content">
                  {(post.post || "").substring(0, 60)}
                  {(post.post || "").length > 60 && "..."}
                </div>
                <div className="cp-post-meta">
                  <span className="cp-post-date">{formatDate(post.postDate)}</span>
                  <div className="cp-post-platforms">
                    {post.platforms?.map((platform, idx) => (
                      <span key={idx} className="cp-platform-badge">
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
      <div className="cp-comments-section">
        {!selectedPost ? (
          <div className="unified-empty-state">
            <div className="empty-icon">💬</div>
            <p className="empty-text">Select a post to view comments</p>
            <p className="empty-subtext">Choose a post from the list to see its comments</p>
          </div>
        ) : (
          <>
            <div className="cp-selected-post-header">
              <h3>Post Comments</h3>
              <p className="cp-post-preview">{selectedPost.post}</p>
            </div>

            {loading ? (
              <LoadingContainer message="Loading comments..." size="sm" />
            ) : comments.length === 0 ? (
              <div className="unified-empty-state">
                <p>No comments yet on this post</p>
                <small>Comments from Facebook and Instagram will appear here</small>
              </div>
            ) : (
              <div className="cp-comments-list">
                {comments.map((comment) => (
                  <div key={comment.id} className="cp-comment-item">
                    <div className="cp-comment-header">
                      <div className="cp-comment-author">
                        <strong>{comment.from?.name || "Anonymous"}</strong>
                        {getPlatformIcon(comment.platform)}
                      </div>
                      <div className="cp-comment-actions">
                        <button
                          className="cp-action-btn cp-reply-action"
                          onClick={() => setReplyingTo(comment.id)}
                          title="Reply to comment"
                        >
                          <FaReply size={14} />
                        </button>
                        <button
                          className="cp-action-btn cp-delete-action"
                          onClick={() => handleDeleteComment(comment.id)}
                          title="Delete comment"
                        >
                          <FaTrash size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="cp-comment-text">{comment.message}</div>
                    <div className="cp-comment-meta">{formatDate(comment.created_time)}</div>

                    {replyingTo === comment.id && (
                      <div className="cp-reply-form">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Write your reply..."
                          rows={3}
                        />
                        <div className="cp-reply-form-actions">
                          <button onClick={() => setReplyingTo(null)} className="cp-btn-cancel">
                            Cancel
                          </button>
                          <button
                            onClick={() => handleReply(comment.id)}
                            className="cp-btn-submit"
                            disabled={!replyText.trim() || isSubmitting}
                          >
                            {isSubmitting ? "Posting..." : "Post Reply"}
                          </button>
                        </div>
                      </div>
                    )}

                    {comment.comments && comment.comments.length > 0 && (
                      <div className="cp-nested-comments">
                        {comment.comments.map((reply) => (
                          <div key={reply.id} className="cp-nested-reply">
                            <div className="cp-nested-header">
                              <strong>{reply.from?.name || "You"}</strong>
                              <span className="cp-nested-date">{formatDate(reply.created_time)}</span>
                            </div>
                            <div className="cp-nested-text">{reply.message}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="cp-add-comment">
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
                className="cp-btn-submit"
                disabled={!replyText.trim() || isSubmitting || replyingTo !== null}
              >
                {isSubmitting ? "Posting..." : "Post Comment"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
