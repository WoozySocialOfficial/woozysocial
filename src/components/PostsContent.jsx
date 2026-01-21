import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";
import { useDrafts, usePosts, useInvalidateQueries } from "../hooks/useQueries";
import { supabase } from "../utils/supabaseClient";
import { useNavigate } from "react-router-dom";
import { FaSearch, FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaReddit, FaTelegram, FaPinterest, FaSnapchat, FaTrash, FaSyncAlt } from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { SiX, SiBluesky } from "react-icons/si";
import { PostDetailPanel } from "./comments/PostDetailPanel";
import { TableSkeleton } from "./ui/LoadingSpinner";
import { formatTableDateTime } from "../utils/timezones";
import "./PostsContent.css";

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  reddit: FaReddit,
  telegram: FaTelegram,
  pinterest: FaPinterest,
  snapchat: FaSnapchat,
  tiktok: FaTiktok,
  twitter: SiX,
  "x/twitter": SiX,
  bluesky: SiBluesky,
};

export const PostsContent = () => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("drafts");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState(null);
  const { invalidatePosts } = useInvalidateQueries();

  // Map tab to status for posts query
  const statusMap = {
    scheduled: "scheduled",
    history: "posted",
    failed: "failed"
  };

  // Use React Query for drafts - only fetch when on drafts tab
  const {
    data: drafts = [],
    isLoading: draftsLoading,
    refetch: refetchDrafts
  } = useDrafts(activeWorkspace?.id, user?.id, {
    enabled: activeTab === "drafts"
  });

  // Use React Query for posts (scheduled, history, failed) - only fetch when NOT on drafts tab
  const {
    data: postsData = [],
    isLoading: postsLoading,
    refetch: refetchPosts
  } = usePosts(activeWorkspace?.id, user?.id, {
    status: statusMap[activeTab],
    limit: 100,
    enabled: activeTab !== "drafts"
  });

  // Get current posts based on active tab
  const posts = activeTab === "drafts" ? drafts : postsData;
  const loading = activeTab === "drafts" ? draftsLoading : postsLoading;

  // Refresh function
  const handleRefresh = () => {
    invalidatePosts(activeWorkspace?.id);
    if (activeTab === "drafts") {
      refetchDrafts();
    } else {
      refetchPosts();
    }
  };

  // Filter posts based on search query
  const filteredPosts = posts.filter(post => {
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    const content = (post.post || post.caption || "").toLowerCase();
    const platforms = Array.isArray(post.platforms)
      ? post.platforms.join(" ").toLowerCase()
      : "";

    return content.includes(query) ||
           content.match(new RegExp(`#\\w*${query}\\w*`, 'i')) ||
           platforms.includes(query);
  });

  const getPlatformIcons = (platforms) => {
    if (!platforms || !Array.isArray(platforms)) return null;

    return platforms.map((platform, idx) => {
      const Icon = PLATFORM_ICONS[platform.toLowerCase()];
      if (!Icon) return null;

      return (
        <div key={idx} className="platform-icon-small" title={platform}>
          <Icon size={16} />
        </div>
      );
    }).filter(Boolean);
  };

  const getMediaPreview = (post) => {
    const mediaUrls = post.mediaUrls || post.media_urls || [];
    if (!mediaUrls.length) return <span className="no-media">No media</span>;

    return (
      <div className="media-preview">
        <img src={mediaUrls[0]} alt="Post media" />
        {mediaUrls.length > 1 && (
          <span className="media-count">+{mediaUrls.length - 1}</span>
        )}
      </div>
    );
  };

  const handleDeleteDraft = async (e, draftId) => {
    e.stopPropagation(); // Prevent row click

    if (!window.confirm("Delete this draft?")) return;

    try {
      const { error } = await supabase
        .from("post_drafts")
        .delete()
        .eq("id", draftId)
        .eq("workspace_id", activeWorkspace.id);

      if (error) throw error;

      // Refresh drafts
      invalidatePosts(activeWorkspace?.id);
      refetchDrafts();
    } catch (error) {
      console.error("Error deleting draft:", error);
    }
  };

  const handleDeletePost = async (e, postId) => {
    e.stopPropagation(); // Prevent row click

    if (!window.confirm("Delete this post from all platforms? This cannot be undone.")) return;

    try {
      const response = await fetch(`${baseURL}/api/post/${postId}?workspaceId=${activeWorkspace.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || "Failed to delete post");
      }

      // Invalidate cache and refresh
      invalidatePosts(activeWorkspace?.id);
      refetchPosts();
    } catch (error) {
      console.error("Error deleting post:", error);
      alert("Failed to delete post: " + error.message);
    }
  };

  const handleRetryPost = async (e, postId) => {
    e.stopPropagation(); // Prevent row click

    if (!window.confirm("Retry posting this to all platforms?")) return;

    try {
      const response = await fetch(`${baseURL}/api/post/retry`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          postId: postId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || "Failed to retry post");
      }

      // Invalidate cache and refresh
      invalidatePosts(activeWorkspace?.id);
      refetchPosts();
    } catch (error) {
      console.error("Error retrying post:", error);
      alert("Failed to retry post: " + error.message);
    }
  };

  const handleLoadDraft = (draft) => {
    // Store draft in sessionStorage to load in Compose page
    sessionStorage.setItem("loadDraft", JSON.stringify(draft));
    navigate("/compose");
  };

  const handleEditScheduledPost = (post) => {
    // Store post in sessionStorage to edit in Compose page
    sessionStorage.setItem("loadDraft", JSON.stringify({
      id: post.id,
      content: post.post || post.caption,
      caption: post.post || post.caption,
      media_urls: post.mediaUrls || (post.media_url ? [post.media_url] : []),
      platforms: post.platforms || [],
      scheduled_date: post.scheduleDate || post.schedule_date || post.scheduled_at,
      workspace_id: activeWorkspace.id,
      isEditingScheduledPost: true // Flag to indicate this is editing a scheduled post
    }));
    setSelectedPost(null); // Close panel
    navigate("/compose");
  };

  return (
    <div className="posts-content">
      {/* Search Bar */}
      <div className="posts-search-container">
        <div className="posts-search-wrapper">
          <div className="posts-search-input">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search by caption, hashtags, or platform..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="posts-tabs-container">
        <div className="posts-tabs">
          <button
            className={`posts-tab ${activeTab === "drafts" ? "active" : ""}`}
            onClick={() => setActiveTab("drafts")}
          >
            Drafts
          </button>
          <button
            className={`posts-tab ${activeTab === "scheduled" ? "active" : ""}`}
            onClick={() => setActiveTab("scheduled")}
          >
            Scheduled
          </button>
          <button
            className={`posts-tab ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            History
          </button>
          <button
            className={`posts-tab ${activeTab === "failed" ? "active" : ""}`}
            onClick={() => setActiveTab("failed")}
          >
            Failed
          </button>
        </div>
        <button
          onClick={handleRefresh}
          className="refresh-button"
          disabled={loading}
          title="Refresh posts"
        >
          <FaSyncAlt className={loading ? 'spinning' : ''} size={20} />
        </button>
      </div>

      {/* Table */}
      <div className="posts-table-container">
        <div className="posts-table-header">
          <div className="posts-checkbox-col">
            <input type="checkbox" />
          </div>
          <div className="posts-date-col">Date</div>
          <div className="posts-content-col">Content</div>
          <div className="posts-media-col">Media</div>
          <div className="posts-socials-col">Socials</div>
        </div>

        <div className="posts-table-body">
          {loading ? (
            <TableSkeleton rows={5} columns={4} />
          ) : filteredPosts.length === 0 ? (
            <div className="posts-empty">
              {searchQuery ? "No posts match your search" : `No ${activeTab} posts yet`}
            </div>
          ) : (
            filteredPosts.map((post, idx) => (
              <div
                key={post.id || idx}
                className={`posts-table-row ${(activeTab === 'drafts' || activeTab === 'scheduled') ? 'clickable' : ''}`}
                onClick={() => {
                  if (activeTab === 'drafts' || activeTab === 'scheduled') {
                    // Normalize post structure for PostDetailPanel
                    const normalizedPost = {
                      ...post,
                      workspace_id: activeWorkspace.id,
                      // Add status if missing (for drafts)
                      status: post.status || (activeTab === 'drafts' ? 'draft' : 'scheduled')
                    };
                    setSelectedPost(normalizedPost);
                  }
                }}
                style={{ cursor: (activeTab === 'drafts' || activeTab === 'scheduled') ? 'pointer' : 'default' }}
              >
                <div className="posts-checkbox-col">
                  {activeTab === 'drafts' ? (
                    <button
                      className="delete-draft-btn"
                      onClick={(e) => handleDeleteDraft(e, post.id)}
                      title="Delete draft"
                    >
                      <FaTrash size={14} />
                    </button>
                  ) : activeTab === 'failed' ? (
                    <button
                      className="retry-post-btn"
                      onClick={(e) => handleRetryPost(e, post.id)}
                      title="Retry post"
                    >
                      <FaSyncAlt size={14} />
                    </button>
                  ) : activeTab === 'history' || activeTab === 'scheduled' ? (
                    <button
                      className="delete-post-btn"
                      onClick={(e) => handleDeletePost(e, post.id)}
                      title="Delete post"
                    >
                      <FaTrash size={14} />
                    </button>
                  ) : (
                    <input type="checkbox" />
                  )}
                </div>
                <div className="posts-date-col">
                  {formatTableDateTime(post.scheduleDate || post.scheduled_date || post.created_at || post.postDate)}
                </div>
                <div className="posts-content-col">
                  <div className="post-content-preview">
                    {(post.post || post.caption || "").substring(0, 100)}
                    {(post.post || post.caption || "").length > 100 && "..."}
                  </div>
                </div>
                <div className="posts-media-col">
                  {getMediaPreview(post)}
                </div>
                <div className="posts-socials-col">
                  <div className="platform-icons-container">
                    {getPlatformIcons(post.platforms)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Post Detail Panel */}
      {selectedPost && (
        <PostDetailPanel
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          showApprovalActions={false}
          onEditDraft={handleLoadDraft}
          onEditScheduledPost={handleEditScheduledPost}
        />
      )}
    </div>
  );
};
