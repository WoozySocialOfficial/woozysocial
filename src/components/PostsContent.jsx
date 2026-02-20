import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";
import { useDrafts, usePosts, useInvalidateQueries } from "../hooks/useQueries";
import { supabase } from "../utils/supabaseClient";
import { useNavigate } from "react-router-dom";
import { FaSearch, FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaPinterest, FaTrash, FaSyncAlt, FaSortAmountDown, FaSortAmountUp } from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { SiX, SiBluesky } from "react-icons/si";
import { PostDetailPanel } from "./comments/PostDetailPanel";
import { LoadingContainer } from "./ui/LoadingSpinner";
import { formatTableDateTime } from "../utils/timezones";
import "./PostsContent.css";

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  pinterest: FaPinterest,
  tiktok: FaTiktok,
  twitter: SiX,
  "x/twitter": SiX,
  bluesky: SiBluesky,
};

const SORT_OPTIONS = {
  drafts: [
    { id: "newest", label: "Newest", field: "created_at", dir: "desc" },
    { id: "oldest", label: "Oldest", field: "created_at", dir: "asc" },
  ],
  pending: [
    { id: "newest", label: "Newest", field: "created_at", dir: "desc" },
    { id: "oldest", label: "Oldest", field: "created_at", dir: "asc" },
    { id: "scheduled_newest", label: "Scheduled: Latest", field: "scheduled_at", dir: "desc" },
    { id: "scheduled_oldest", label: "Scheduled: Earliest", field: "scheduled_at", dir: "asc" },
  ],
  scheduled: [
    { id: "scheduled_oldest", label: "Upcoming first", field: "scheduled_at", dir: "asc" },
    { id: "scheduled_newest", label: "Latest first", field: "scheduled_at", dir: "desc" },
    { id: "newest", label: "Created: Newest", field: "created_at", dir: "desc" },
    { id: "oldest", label: "Created: Oldest", field: "created_at", dir: "asc" },
  ],
  history: [
    { id: "newest", label: "Newest", field: "posted_at", dir: "desc" },
    { id: "oldest", label: "Oldest", field: "posted_at", dir: "asc" },
    { id: "created_newest", label: "Created: Newest", field: "created_at", dir: "desc" },
    { id: "created_oldest", label: "Created: Oldest", field: "created_at", dir: "asc" },
  ],
  failed: [
    { id: "newest", label: "Newest", field: "created_at", dir: "desc" },
    { id: "oldest", label: "Oldest", field: "created_at", dir: "asc" },
  ],
};

export const PostsContent = () => {
  const { user } = useAuth();
  const { activeWorkspace, canApprove, hasFinalApproval } = useWorkspace();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("drafts");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState(null);
  const [sortBy, setSortBy] = useState(SORT_OPTIONS.drafts[0].id);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const selectAllRef = useRef(null);
  const { invalidatePosts } = useInvalidateQueries();

  // Map tab to status for posts query
  const statusMap = {
    pending: "pending_approval", // NEW: For pending tab
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

  // Use React Query for pending approval posts - only fetch when on pending tab
  const {
    data: pendingPosts = [],
    isLoading: pendingLoading,
    refetch: refetchPending
  } = usePosts(activeWorkspace?.id, user?.id, {
    approvalStatus: ['pending', 'pending_internal', 'pending_client', 'changes_requested'],
    limit: 100,
    enabled: activeTab === "pending"
  });

  // Use React Query for posts (scheduled, history, failed) - only fetch when NOT on drafts or pending tab
  const {
    data: postsData = [],
    isLoading: postsLoading,
    refetch: refetchPosts
  } = usePosts(activeWorkspace?.id, user?.id, {
    status: statusMap[activeTab],
    limit: 100,
    enabled: activeTab !== "drafts" && activeTab !== "pending"
  });

  // Get current posts based on active tab
  const posts = activeTab === "drafts"
    ? drafts
    : activeTab === "pending"
      ? pendingPosts
      : postsData;
  const loading = activeTab === "drafts"
    ? draftsLoading
    : activeTab === "pending"
      ? pendingLoading
      : postsLoading;

  // Refresh function
  const handleRefresh = () => {
    invalidatePosts(activeWorkspace?.id);
    if (activeTab === "drafts") {
      refetchDrafts();
    } else if (activeTab === "pending") {
      refetchPending();
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

  // Sort posts client-side
  const sortOptions = SORT_OPTIONS[activeTab] || SORT_OPTIONS.drafts;
  const activeSortOption = sortOptions.find(o => o.id === sortBy) || sortOptions[0];
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    const dateA = new Date(a[activeSortOption.field] || a.scheduled_at || a.created_at || 0);
    const dateB = new Date(b[activeSortOption.field] || b.scheduled_at || b.created_at || 0);
    return activeSortOption.dir === "desc" ? dateB - dateA : dateA - dateB;
  });

  // Selection derived state
  const allSelected = sortedPosts.length > 0 && sortedPosts.every(p => selectedIds.has(p.id));
  const someSelected = sortedPosts.some(p => selectedIds.has(p.id));

  // Keep the select-all checkbox indeterminate when only some rows are selected
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedPosts.map(p => p.id)));
    }
  };

  const handleToggleSelect = (e, postId) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} selected item${count > 1 ? 's' : ''}? This cannot be undone.`)) return;

    try {
      if (activeTab === 'drafts') {
        const { error } = await supabase
          .from('post_drafts')
          .delete()
          .in('id', [...selectedIds])
          .eq('workspace_id', activeWorkspace.id);
        if (error) throw error;
        invalidatePosts(activeWorkspace?.id);
        refetchDrafts();
      } else {
        const selectedPosts = sortedPosts.filter(p => selectedIds.has(p.id));
        const results = await Promise.allSettled(
          selectedPosts.map(post =>
            fetch(`${baseURL}/api/post/delete`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                postId: post.ayr_post_id || null,
                databaseId: post.id,
                workspaceId: activeWorkspace.id
              })
            })
          )
        );
        const failed = results.filter(r => r.status === 'rejected').length;
        invalidatePosts(activeWorkspace?.id);
        refetchPosts();
        if (failed > 0) alert(`${failed} item${failed > 1 ? 's' : ''} failed to delete.`);
      }
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error bulk deleting:', error);
      alert('Failed to delete: ' + error.message);
    }
  };

  const handleApproval = async (postId, action, commentText = '') => {
    if (!activeWorkspace || !user) return;
    setActionLoading(true);
    try {
      const response = await fetch(`${baseURL}/api/post/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, workspaceId: activeWorkspace.id, userId: user.id, action, comment: commentText }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update approval');
      }
      invalidatePosts(activeWorkspace?.id);
      refetchPending();
      setSelectedPost(null);
    } catch (error) {
      console.error('Error updating approval:', error);
      alert('Action failed: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = (postId) => handleApproval(postId, 'approve');
  const handleReject = (postId, comment) => handleApproval(postId, 'reject', comment);
  const handleRequestChanges = (postId, comment) => handleApproval(postId, 'changes_requested', comment);
  const handleForwardToClient = (postId) => handleApproval(postId, 'forward_to_client');

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSortBy(SORT_OPTIONS[tab][0].id);
    setShowSortMenu(false);
    setSelectedPost(null);
    setSelectedIds(new Set());
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

    const firstMedia = mediaUrls[0];
    const isVideo = firstMedia?.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i);

    return (
      <div className="media-preview">
        {isVideo ? (
          <video src={firstMedia} alt="Post media" muted />
        ) : (
          <img src={firstMedia} alt="Post media" />
        )}
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

  const handleDeletePost = async (e, post) => {
    e.stopPropagation(); // Prevent row click

    if (!window.confirm("Delete this post from all platforms? This cannot be undone.")) return;

    try {
      const response = await fetch(`${baseURL}/api/post/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.ayr_post_id || null,
          databaseId: post.id,
          workspaceId: activeWorkspace.id
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || "Failed to delete post");
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
      media_urls: post.mediaUrls || post.media_urls || (post.media_url ? [post.media_url] : []),
      platforms: post.platforms || [],
      scheduled_date: post.scheduleDate || post.schedule_date || post.scheduled_at,
      post_settings: post.post_settings || {},
      approval_status: post.approval_status,
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
            onClick={() => handleTabChange("drafts")}
          >
            Drafts
          </button>
          <button
            className={`posts-tab ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => handleTabChange("pending")}
          >
            Pending
          </button>
          <button
            className={`posts-tab ${activeTab === "scheduled" ? "active" : ""}`}
            onClick={() => handleTabChange("scheduled")}
          >
            Scheduled
          </button>
          <button
            className={`posts-tab ${activeTab === "history" ? "active" : ""}`}
            onClick={() => handleTabChange("history")}
          >
            History
          </button>
          <button
            className={`posts-tab ${activeTab === "failed" ? "active" : ""}`}
            onClick={() => handleTabChange("failed")}
          >
            Failed
          </button>
        </div>
        <div className="posts-tabs-actions">
          <div className="posts-sort-wrapper">
            <button
              className="posts-sort-toggle"
              onClick={() => setShowSortMenu(prev => !prev)}
            >
              {activeSortOption.dir === "desc" ? <FaSortAmountDown /> : <FaSortAmountUp />}
              <span>{activeSortOption.label}</span>
            </button>
            {showSortMenu && (
              <>
                <div className="posts-sort-backdrop" onClick={() => setShowSortMenu(false)} />
                <div className="posts-sort-menu">
                  {sortOptions.map((option) => (
                    <button
                      key={option.id}
                      className={`posts-sort-item ${sortBy === option.id ? "active" : ""}`}
                      onClick={() => {
                        setSortBy(option.id);
                        setShowSortMenu(false);
                      }}
                    >
                      {option.dir === "desc" ? <FaSortAmountDown /> : <FaSortAmountUp />}
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {someSelected && (
            <button className="bulk-delete-btn" onClick={handleBulkDelete}>
              <FaTrash size={13} />
              Delete ({selectedIds.size})
            </button>
          )}
          <button
            onClick={handleRefresh}
            className="refresh-button"
            disabled={loading}
            title="Refresh posts"
          >
            <FaSyncAlt className={loading ? 'spinning' : ''} size={20} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="posts-table-container">
        <div className="posts-table-header">
          <div className="posts-checkbox-col">
            <input
              type="checkbox"
              ref={selectAllRef}
              checked={allSelected}
              onChange={handleSelectAll}
            />
          </div>
          <div className="posts-date-col">Date</div>
          <div className="posts-content-col">Content</div>
          <div className="posts-media-col">Media</div>
          <div className="posts-socials-col">Socials</div>
          <div className="posts-actions-col"></div>
        </div>

        <div className="posts-table-body">
          {loading ? (
            <LoadingContainer message={`Loading ${activeTab}...`} />
          ) : sortedPosts.length === 0 ? (
            <div className="posts-empty">
              {searchQuery ? "No posts match your search" : `No ${activeTab} posts yet`}
            </div>
          ) : (
            sortedPosts.map((post, idx) => (
              <div
                key={post.id || idx}
                className={`posts-table-row ${(activeTab === 'drafts' || activeTab === 'scheduled' || activeTab === 'pending' || activeTab === 'history' || activeTab === 'failed') ? 'clickable' : ''}`}
                onClick={() => {
                  if (activeTab === 'drafts' || activeTab === 'scheduled' || activeTab === 'pending' || activeTab === 'history' || activeTab === 'failed') {
                    // Normalize post structure for PostDetailPanel
                    const normalizedPost = {
                      ...post,
                      workspace_id: activeWorkspace.id,
                      // Add status if missing (for drafts)
                      status: post.status || (activeTab === 'drafts' ? 'draft' : activeTab === 'pending' ? 'pending_approval' : activeTab === 'history' ? 'posted' : activeTab === 'failed' ? 'failed' : 'scheduled')
                    };
                    setSelectedPost(normalizedPost);
                  }
                }}
                style={{ cursor: (activeTab === 'drafts' || activeTab === 'scheduled' || activeTab === 'pending' || activeTab === 'history' || activeTab === 'failed') ? 'pointer' : 'default' }}
              >
                <div className="posts-checkbox-col">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(post.id)}
                    onChange={(e) => handleToggleSelect(e, post.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="posts-date-col">
                  <div>{formatTableDateTime(post.scheduleDate || post.scheduled_date || post.created_at || post.postDate)}</div>
                  {activeTab === "pending" && post.approval_status && (() => {
                    const statusConfig = {
                      pending_internal:   { label: 'Pending Final Review', bg: '#f59e0b', color: '#fff' },
                      pending_client:     { label: 'Awaiting Client',      bg: '#8b5cf6', color: '#fff' },
                      pending:            { label: 'Pending Approval',     bg: '#afabf9', color: '#114C5A' },
                      changes_requested:  { label: 'Changes Requested',    bg: '#f59e0b', color: '#fff' },
                    };
                    const cfg = statusConfig[post.approval_status];
                    if (!cfg) return null;
                    return (
                      <span style={{
                        display: 'inline-block', marginTop: '4px', padding: '2px 8px',
                        borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                        textTransform: 'uppercase', backgroundColor: cfg.bg, color: cfg.color
                      }}>
                        {cfg.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="posts-content-col">
                  <div className="post-content-preview">
                    {(post.post || post.caption || "").substring(0, 100)}
                    {(post.post || post.caption || "").length > 100 && "..."}
                  </div>
                  {activeTab === 'failed' && (post.last_error || post.lastError) && (
                    <div className="post-failure-reason">
                      {(post.last_error || post.lastError).substring(0, 120)}
                      {(post.last_error || post.lastError).length > 120 && '...'}
                    </div>
                  )}
                </div>
                <div className="posts-media-col">
                  {getMediaPreview(post)}
                </div>
                <div className="posts-socials-col">
                  <div className="platform-icons-container">
                    {getPlatformIcons(post.platforms)}
                  </div>
                </div>
                {activeTab === 'failed' && (
                  <div className="posts-actions-col">
                    <button
                      className="retry-post-btn"
                      onClick={(e) => handleRetryPost(e, post.id)}
                      title="Retry post"
                    >
                      <FaSyncAlt size={14} />
                    </button>
                  </div>
                )}
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
          showApprovalActions={canApprove || hasFinalApproval}
          onApprove={handleApprove}
          onReject={handleReject}
          onRequestChanges={handleRequestChanges}
          onForwardToClient={handleForwardToClient}
          actionLoading={actionLoading}
          onEditDraft={handleLoadDraft}
          onEditScheduledPost={handleEditScheduledPost}
        />
      )}
    </div>
  );
};
