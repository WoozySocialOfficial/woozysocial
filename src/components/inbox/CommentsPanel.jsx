import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { baseURL } from "../../utils/constants";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaReply, FaTrash, FaSyncAlt, FaSearch, FaSortAmountDown, FaSortAmountUp, FaPinterest } from "react-icons/fa";
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
  pinterest: FaPinterest,
};

const PLATFORM_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  bluesky: "Bluesky",
  pinterest: "Pinterest",
};

const POST_SORT_OPTIONS = [
  { id: "newest", label: "Newest first", field: "postDate", dir: "desc" },
  { id: "oldest", label: "Oldest first", field: "postDate", dir: "asc" },
];

const COMMENT_SORT_OPTIONS = [
  { id: "newest", label: "Newest first", field: "created_time", dir: "desc" },
  { id: "oldest", label: "Oldest first", field: "created_time", dir: "asc" },
];

export const CommentsPanel = ({ onRefresh }) => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter & search state
  const [selectedPlatforms, setSelectedPlatforms] = useState(new Set());
  const [allChecked, setAllChecked] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Sort state
  const [postSortBy, setPostSortBy] = useState("newest");
  const [commentSortBy, setCommentSortBy] = useState("newest");
  const [showPostSortMenu, setShowPostSortMenu] = useState(false);
  const [showCommentSortMenu, setShowCommentSortMenu] = useState(false);

  const allCheckboxRef = useRef(null);

  // Derive available platforms from posts data
  const availablePlatforms = useMemo(() => {
    const platformSet = new Set();
    posts.forEach(post => {
      post.platforms?.forEach(p => {
        const normalized = p.toLowerCase();
        if (normalized !== "x/twitter") platformSet.add(normalized);
        else platformSet.add("twitter");
      });
    });
    return Array.from(platformSet).sort();
  }, [posts]);

  // Initialize selectedPlatforms when availablePlatforms change
  useEffect(() => {
    if (availablePlatforms.length > 0 && allChecked) {
      setSelectedPlatforms(new Set(availablePlatforms));
    }
  }, [availablePlatforms, allChecked]);

  // Update "All" checkbox indeterminate state
  useEffect(() => {
    if (allCheckboxRef.current) {
      const allSelected = availablePlatforms.length > 0 && availablePlatforms.every(p => selectedPlatforms.has(p));
      const someSelected = availablePlatforms.some(p => selectedPlatforms.has(p));
      allCheckboxRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [selectedPlatforms, availablePlatforms]);

  const handleAllToggle = () => {
    if (allChecked) {
      setSelectedPlatforms(new Set());
      setAllChecked(false);
    } else {
      setSelectedPlatforms(new Set(availablePlatforms));
      setAllChecked(true);
    }
  };

  const handlePlatformToggle = (platform) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      setAllChecked(availablePlatforms.every(p => next.has(p)));
      return next;
    });
  };

  // Filter and sort posts
  const filteredSortedPosts = useMemo(() => {
    let filtered = posts;

    // Platform filter
    if (!allChecked && selectedPlatforms.size > 0) {
      filtered = filtered.filter(post =>
        post.platforms?.some(p => {
          const normalized = p.toLowerCase() === "x/twitter" ? "twitter" : p.toLowerCase();
          return selectedPlatforms.has(normalized);
        })
      );
    } else if (!allChecked && selectedPlatforms.size === 0) {
      filtered = [];
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(post => {
        const content = (post.post || "").toLowerCase();
        const platforms = (post.platforms || []).join(" ").toLowerCase();
        return content.includes(query) || platforms.includes(query);
      });
    }

    // Sort
    const sortOption = POST_SORT_OPTIONS.find(o => o.id === postSortBy) || POST_SORT_OPTIONS[0];
    return [...filtered].sort((a, b) => {
      const dateA = new Date(a[sortOption.field] || a.created_at || 0);
      const dateB = new Date(b[sortOption.field] || b.created_at || 0);
      return sortOption.dir === "desc" ? dateB - dateA : dateA - dateB;
    });
  }, [posts, selectedPlatforms, allChecked, searchQuery, postSortBy]);

  // Sort comments
  const sortedComments = useMemo(() => {
    const sortOption = COMMENT_SORT_OPTIONS.find(o => o.id === commentSortBy) || COMMENT_SORT_OPTIONS[0];
    return [...comments].sort((a, b) => {
      const dateA = new Date(a[sortOption.field] || 0);
      const dateB = new Date(b[sortOption.field] || 0);
      return sortOption.dir === "desc" ? dateB - dateA : dateA - dateB;
    });
  }, [comments, commentSortBy]);

  const fetchPosts = useCallback(async () => {
    if (!user || !activeWorkspace) return;

    setLoading(true);
    try {
      const response = await fetch(`${baseURL}/api/post-history?workspaceId=${activeWorkspace.id}&lastDays=365`);
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

    setCommentsLoading(true);
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
      setCommentsLoading(false);
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

  const activePostSort = POST_SORT_OPTIONS.find(o => o.id === postSortBy) || POST_SORT_OPTIONS[0];
  const activeCommentSort = COMMENT_SORT_OPTIONS.find(o => o.id === commentSortBy) || COMMENT_SORT_OPTIONS[0];

  return (
    <div className="unified-inbox-grid">
      {/* Left Sidebar - Posts List */}
      <div className="cp-posts-sidebar">
        <div className="cp-sidebar-header">
          <h3>Posts</h3>
          <div className="cp-sidebar-header-actions">
            <div className="cp-sort-wrapper">
              <button
                className="cp-sort-toggle"
                onClick={() => setShowPostSortMenu(prev => !prev)}
                title="Sort posts"
              >
                {activePostSort.dir === "desc" ? <FaSortAmountDown size={12} /> : <FaSortAmountUp size={12} />}
                <span>{activePostSort.label}</span>
              </button>
              {showPostSortMenu && (
                <>
                  <div className="cp-sort-backdrop" onClick={() => setShowPostSortMenu(false)} />
                  <div className="cp-sort-menu">
                    {POST_SORT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        className={`cp-sort-item ${postSortBy === option.id ? "active" : ""}`}
                        onClick={() => {
                          setPostSortBy(option.id);
                          setShowPostSortMenu(false);
                        }}
                      >
                        {option.dir === "desc" ? <FaSortAmountDown size={12} /> : <FaSortAmountUp size={12} />}
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button onClick={fetchPosts} className="cp-sync-btn" disabled={loading} title="Refresh posts">
              <FaSyncAlt className={loading ? 'spinning' : ''} size={14} />
            </button>
          </div>
        </div>

        {/* Platform Filter Checkboxes */}
        {availablePlatforms.length > 0 && (
          <div className="cp-platform-filters">
            <label className="cp-platform-checkbox">
              <input
                type="checkbox"
                ref={allCheckboxRef}
                checked={allChecked}
                onChange={handleAllToggle}
              />
              <span className="cp-checkbox-label">All Platforms</span>
              <span className="cp-checkbox-count">{posts.length}</span>
            </label>
            {availablePlatforms.map(platform => {
              const Icon = PLATFORM_ICONS[platform] || FaFacebookF;
              const count = posts.filter(p =>
                p.platforms?.some(pp => {
                  const normalized = pp.toLowerCase() === "x/twitter" ? "twitter" : pp.toLowerCase();
                  return normalized === platform;
                })
              ).length;
              return (
                <label key={platform} className="cp-platform-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.has(platform)}
                    onChange={() => handlePlatformToggle(platform)}
                  />
                  <Icon className="cp-checkbox-icon" />
                  <span className="cp-checkbox-label">{PLATFORM_LABELS[platform] || platform}</span>
                  <span className="cp-checkbox-count">{count}</span>
                </label>
              );
            })}
          </div>
        )}

        {/* Search Bar */}
        <div className="cp-search-wrapper">
          <FaSearch className="cp-search-icon" />
          <input
            type="text"
            className="cp-search-input"
            placeholder="Search posts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Posts List */}
        {loading && posts.length === 0 ? (
          <LoadingContainer message="Loading posts..." size="sm" />
        ) : filteredSortedPosts.length === 0 ? (
          <div className="unified-empty-state">
            {posts.length === 0 ? "No published posts yet" : "No posts match your filters"}
          </div>
        ) : (
          <div className="cp-posts-list">
            {filteredSortedPosts.map((post) => (
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
            <div className="empty-icon">&#128172;</div>
            <p className="empty-text">Select a post to view comments</p>
            <p className="empty-subtext">Choose a post from the list to see its comments</p>
          </div>
        ) : (
          <>
            <div className="cp-selected-post-header">
              <div className="cp-comments-header-row">
                <h3>Post Comments</h3>
                <div className="cp-comments-header-actions">
                  <div className="cp-sort-wrapper">
                    <button
                      className="cp-sort-toggle"
                      onClick={() => setShowCommentSortMenu(prev => !prev)}
                      title="Sort comments"
                    >
                      {activeCommentSort.dir === "desc" ? <FaSortAmountDown size={12} /> : <FaSortAmountUp size={12} />}
                      <span>{activeCommentSort.label}</span>
                    </button>
                    {showCommentSortMenu && (
                      <>
                        <div className="cp-sort-backdrop" onClick={() => setShowCommentSortMenu(false)} />
                        <div className="cp-sort-menu">
                          {COMMENT_SORT_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              className={`cp-sort-item ${commentSortBy === option.id ? "active" : ""}`}
                              onClick={() => {
                                setCommentSortBy(option.id);
                                setShowCommentSortMenu(false);
                              }}
                            >
                              {option.dir === "desc" ? <FaSortAmountDown size={12} /> : <FaSortAmountUp size={12} />}
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button onClick={fetchComments} className="cp-sync-btn" disabled={commentsLoading} title="Sync comments">
                    <FaSyncAlt className={commentsLoading ? 'spinning' : ''} size={14} />
                  </button>
                </div>
              </div>
              <p className="cp-post-preview">{selectedPost.post}</p>
            </div>

            {commentsLoading ? (
              <LoadingContainer message="Loading comments..." size="sm" />
            ) : sortedComments.length === 0 ? (
              <div className="unified-empty-state">
                <p>No comments yet on this post</p>
                <small>Comments from your social platforms will appear here</small>
              </div>
            ) : (
              <div className="cp-comments-list">
                {sortedComments.map((comment) => (
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
