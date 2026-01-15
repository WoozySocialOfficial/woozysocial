import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";
import { supabase } from "../utils/supabaseClient";
import { useNavigate } from "react-router-dom";
import { FaSearch, FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaReddit, FaTelegram, FaPinterest, FaSnapchat, FaTrash, FaSyncAlt } from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { SiX, SiBluesky } from "react-icons/si";
import { PostDetailPanel } from "./comments/PostDetailPanel";
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
  const [posts, setPosts] = useState([]);
  const [allAyrsharePosts, setAllAyrsharePosts] = useState([]); // Cache Ayrshare data
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState(null);

  // Fetch Ayrshare history once and cache it
  const fetchAyrshareHistory = useCallback(async () => {
    if (!user || !activeWorkspace?.id) return;

    try {
      const response = await fetch(`${baseURL}/api/post-history?workspaceId=${activeWorkspace.id}`);
      if (!response.ok) throw new Error("Failed to fetch post history");

      const data = await response.json();
      // Handle both old format (data.history) and new format (data.data.history)
      const responseData = data.data || data;
      const allPosts = responseData.history || [];
      setAllAyrsharePosts(allPosts);

      console.log("Ayrshare history fetched:", allPosts.length, "posts");
      return allPosts;
    } catch (error) {
      console.error("Error fetching Ayrshare history:", error);
      return [];
    }
  }, [user, activeWorkspace]);

  // Filter posts based on active tab (uses cached data)
  const filterPosts = useCallback((tabName, ayrsharePosts) => {
    const now = new Date();

    if (tabName === "scheduled") {
      return ayrsharePosts.filter(post => {
        if (post.status === "scheduled") return true;
        if (post.type === "schedule" || post.type === "scheduled") return true;
        if (post.scheduleDate) {
          const scheduleTime = new Date(post.scheduleDate);
          return scheduleTime > now;
        }
        return false;
      });
    } else if (tabName === "history") {
      return ayrsharePosts.filter(post => {
        return post.status === "success" && post.type !== "schedule" && post.type !== "scheduled";
      });
    } else if (tabName === "failed") {
      return ayrsharePosts.filter(post => post.status === "error");
    }
    return [];
  }, []);

  // Fetch posts based on active tab
  const fetchPosts = useCallback(async () => {
    if (!user || !activeWorkspace?.id) return;

    setLoading(true);
    try {
      if (activeTab === "drafts") {
        // Fetch drafts from Supabase
        const { data, error } = await supabase
          .from("post_drafts")
          .select("*")
          .eq("workspace_id", activeWorkspace.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setPosts(data || []);
      } else if (activeTab === "scheduled") {
        // Fetch scheduled posts from Supabase
        const { data, error } = await supabase
          .from("posts")
          .select("*")
          .eq("workspace_id", activeWorkspace.id)
          .eq("status", "scheduled")
          .order("scheduled_at", { ascending: true });

        if (error) throw error;
        setPosts(data || []);
      } else if (activeTab === "history") {
        // Fetch posted posts from Supabase
        const { data, error } = await supabase
          .from("posts")
          .select("*")
          .eq("workspace_id", activeWorkspace.id)
          .eq("status", "posted")
          .order("posted_at", { ascending: false });

        if (error) throw error;
        setPosts(data || []);
      } else if (activeTab === "failed") {
        // Fetch failed posts from Supabase
        const { data, error } = await supabase
          .from("posts")
          .select("*")
          .eq("workspace_id", activeWorkspace.id)
          .eq("status", "failed")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setPosts(data || []);
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [user, activeTab, activeWorkspace]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

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

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

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

      // Refresh posts
      fetchPosts();
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

      // Clear cache and refresh
      setAllAyrsharePosts([]);
      await fetchPosts();
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

      // Clear cache and refresh
      setAllAyrsharePosts([]);
      await fetchPosts();
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
      workspace_id: activeWorkspace.id
    }));
    setSelectedPost(null); // Close panel
    navigate("/compose");
  };

  const handleRefresh = async () => {
    setAllAyrsharePosts([]); // Clear cache
    await fetchPosts(); // Refetch
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
            <div className="posts-loading">Loading posts...</div>
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
                    setSelectedPost({...post, workspace_id: activeWorkspace.id});
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
                  {formatDate(post.scheduleDate || post.scheduled_date || post.created_at || post.postDate)}
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
