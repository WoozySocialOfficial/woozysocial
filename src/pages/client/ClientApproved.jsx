import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useAuth } from "../../contexts/AuthContext";
import { useClientApprovedPosts } from "../../hooks/useQueries";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaPinterest, FaCheck, FaTimes, FaSortAmountDown, FaSortAmountUp } from "react-icons/fa";
import { FaTiktok, FaThreads } from "react-icons/fa6";
import { SiX, SiBluesky } from "react-icons/si";
import { ApprovedPostModal } from "../../components/client/ApprovedPostModal";
import "./ClientApproved.css";

export const ClientApproved = () => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const location = useLocation();
  const [filter, setFilter] = useState("all"); // all, approved, rejected
  const [sortOrder, setSortOrder] = useState("newest");
  const [selectedPost, setSelectedPost] = useState(null);
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const postRefs = useRef({});

  // Use React Query for cached data fetching
  const { data: posts = [], isLoading: loading } = useClientApprovedPosts(
    activeWorkspace?.id,
    user?.id
  );

  const filteredPosts = posts.filter((post) => {
    if (filter === "all") return true;
    if (filter === "approved") return post.approval_status === "approved";
    if (filter === "rejected") return post.approval_status === "rejected";
    return true;
  });

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    const dateA = new Date(a.reviewed_at || a.scheduled_at || a.created_at || 0);
    const dateB = new Date(b.reviewed_at || b.scheduled_at || b.created_at || 0);
    return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
  });

  // Handle deep-link from dashboard activity click
  useEffect(() => {
    const navState = location.state;
    if (!navState?.postId || loading || posts.length === 0) return;

    // Set the filter to match the post's status
    if (navState.filter && navState.filter !== filter) {
      setFilter(navState.filter);
    }

    // Highlight the target post
    setHighlightedPostId(navState.postId);

    // Clear the location state
    window.history.replaceState({}, document.title);

    // Auto-remove highlight after 3 seconds
    const timer = setTimeout(() => {
      setHighlightedPostId(null);
    }, 3000);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, posts, loading]);

  // Scroll to highlighted post once rendered
  useEffect(() => {
    if (highlightedPostId && postRefs.current[highlightedPostId]) {
      postRefs.current[highlightedPostId].scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [highlightedPostId, filteredPosts]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
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
    pinterest: FaPinterest,
    threads: FaThreads
  };

  const getPlatformIcon = (platform) => {
    const IconComponent = PLATFORM_ICONS[platform.toLowerCase()];
    return IconComponent ? <IconComponent /> : null;
  };

  return (
    <div className="client-approved">
      <div className="approved-header">
        <div className="header-content">
          <h1>Post History</h1>
          <p>View your approved and rejected posts.</p>
        </div>

        <div className="filter-row">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={`filter-btn ${filter === "approved" ? "active" : ""}`}
              onClick={() => setFilter("approved")}
            >
              ✅ Approved
            </button>
            <button
              className={`filter-btn ${filter === "rejected" ? "active" : ""}`}
              onClick={() => setFilter("rejected")}
            >
              ❌ Rejected
            </button>
          </div>
          <button
            className="sort-toggle"
            onClick={() => setSortOrder(prev => prev === "newest" ? "oldest" : "newest")}
            title={sortOrder === "newest" ? "Showing newest first" : "Showing oldest first"}
          >
            {sortOrder === "newest" ? <FaSortAmountDown /> : <FaSortAmountUp />}
            <span>{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading post history...</div>
      ) : sortedPosts.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📭</span>
          <p>No posts found in your history.</p>
        </div>
      ) : (
        <div className="posts-grid">
          {sortedPosts.map((post) => (
            <div
              key={post.id}
              ref={(el) => { postRefs.current[post.id] = el; }}
              className={`history-card ${highlightedPostId === post.id ? 'highlighted' : ''}`}
              onClick={() => setSelectedPost(post)}
            >
              {post.media_urls?.length > 0 && (
                <div className="card-media">
                  <img src={post.media_urls[0]} alt="Post media" />
                </div>
              )}

              <div className="card-content">
                <div className="card-status">
                  <span className={`status-badge ${post.approval_status}`}>
                    {post.approval_status === "approved" ?
                      <><FaCheck /> Approved</> :
                      <><FaTimes /> Rejected</>
                    }
                  </span>
                </div>

                <div className="card-caption">
                  {post.caption?.substring(0, 150) || "No caption"}
                  {post.caption?.length > 150 && "..."}
                </div>

                <div className="card-platforms">
                  {post.platforms?.map((p) => (
                    <span key={p} className="platform-icon" title={p}>
                      {getPlatformIcon(p)}
                    </span>
                  ))}
                </div>

                <div className="card-meta">
                  <div className="meta-item">
                    <span className="meta-label">Scheduled:</span>
                    <span className="meta-value">{formatDate(post.scheduled_at)}</span>
                  </div>
                  {post.reviewed_at && (
                    <div className="meta-item">
                      <span className="meta-label">Reviewed:</span>
                      <span className="meta-value">{formatDate(post.reviewed_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post Detail Modal */}
      {selectedPost && (
        <ApprovedPostModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
};
