import React, { useState, useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useAuth } from "../../contexts/AuthContext";
import { usePendingApprovals, useInvalidateQueries } from "../../hooks/useQueries";
import { baseURL } from "../../utils/constants";
import { useToast } from "@chakra-ui/react";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaPinterest, FaCheck, FaTimes, FaClock, FaEdit, FaChevronLeft, FaChevronRight, FaSortAmountDown, FaSortAmountUp } from "react-icons/fa";
import { FaTiktok, FaThreads } from "react-icons/fa6";
import { SiX, SiBluesky } from "react-icons/si";
import { CommentThread } from "../../components/comments/CommentThread";
import "./ClientApprovals.css";

export const ClientApprovals = () => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { invalidatePosts } = useInvalidateQueries();
  const [selectedPost, setSelectedPost] = useState(null);
  const [activeTab, setActiveTab] = useState("pending_client");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [sortBy, setSortBy] = useState("scheduled_newest");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const postRefs = useRef({});
  const processedUrlPostIds = useRef(new Set());

  // Get postId from URL query params
  const urlPostId = searchParams.get('postId');

  // Use React Query for cached data fetching
  const {
    data: posts = [],
    isLoading: loading,
    refetch: refetchPosts
  } = usePendingApprovals(activeWorkspace?.id, user?.id, activeTab);

  const tabs = [
    {
      id: "pending_client",
      label: "Awaiting Approval",
      icon: FaClock,
      description: "Posts forwarded by final approvers"
    },
    {
      id: "pending",
      label: "Direct Pending",
      icon: FaClock,
      description: "Posts sent directly (no final approver)"
    },
    {
      id: "changes_requested",
      label: "Changes Requested",
      icon: FaEdit
    },
    {
      id: "approved",
      label: "Approved",
      icon: FaCheck
    },
    {
      id: "rejected",
      label: "Rejected",
      icon: FaTimes
    }
  ];

  // Handle deep-link from dashboard activity click
  useEffect(() => {
    const navState = location.state;
    if (!navState?.postId || loading || posts.length === 0) return;

    // Switch to the correct tab if specified
    if (navState.tab && navState.tab !== activeTab) {
      setActiveTab(navState.tab);
      return; // Tab change will trigger refetch, selection happens on next run
    }

    // Find and select the target post
    const targetPost = posts.find(p => p.id === navState.postId);
    if (targetPost) {
      setSelectedPost(targetPost);
      // Clear the location state so refreshing doesn't re-trigger
      window.history.replaceState({}, document.title);
    }
  }, [location.state, posts, loading, activeTab]);

  // Reset media carousel index when selected post changes
  useEffect(() => {
    setMediaIndex(0);
  }, [selectedPost?.id]);

  // Auto-select first post when posts change (only if no deep-link)
  useEffect(() => {
    if (posts.length > 0 && !selectedPost && !location.state?.postId && !urlPostId) {
      setSelectedPost(posts[0]);
    }
  }, [posts, selectedPost, location.state?.postId, urlPostId]);

  // Handle postId from URL query params (from notifications)
  useEffect(() => {
    const findAndSelectPost = async () => {
      if (!urlPostId || !user?.id || !activeWorkspace?.id) return;

      // Prevent processing the same postId multiple times
      if (processedUrlPostIds.current.has(urlPostId)) return;
      processedUrlPostIds.current.add(urlPostId);

      // Fetch all posts to find the one with this ID across all tabs
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
        let foundTab = null;

        for (const [status, statusPosts] of Object.entries(grouped)) {
          const post = statusPosts?.find(p => p.id === urlPostId);
          if (post) {
            foundPost = post;
            foundTab = status;
            break;
          }
        }

        if (foundPost && foundTab) {
          // Switch to the correct tab if needed
          if (foundTab !== activeTab) {
            setActiveTab(foundTab);
          }

          // Wait for React Query to fetch posts for the new tab AND for DOM to update
          // Increased timeout to ensure posts are loaded
          const waitTime = foundTab !== activeTab ? 800 : 300;

          setTimeout(() => {
            // Double-check the post is now in the posts array
            // This handles the case where React Query needs time to fetch
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
                // Post not in DOM yet, try again after a short delay
                setTimeout(checkAndScroll, 200);
              }
            };

            checkAndScroll();

            // Remove highlight after animation
            setTimeout(() => {
              setHighlightedPostId(null);
              // Clear the URL param
              setSearchParams({});
              // Clear the processed ID so same post can be navigated to again later
              processedUrlPostIds.current.delete(urlPostId);
            }, 3000);
          }, waitTime);
        }
      } catch (error) {
        console.error('Error finding post:', error);
        processedUrlPostIds.current.delete(urlPostId); // Clear on error so it can retry
      }
    };

    findAndSelectPost();
  }, [urlPostId, user?.id, activeWorkspace?.id, setSearchParams]);

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
    pinterest: FaPinterest,
    threads: FaThreads
  };

  const getPlatformIcon = (platform) => {
    const IconComponent = PLATFORM_ICONS[platform.toLowerCase()];
    return IconComponent ? <IconComponent /> : null;
  };

  const SORT_OPTIONS = [
    { id: "scheduled_newest", label: "Scheduled: Newest", field: "scheduled_at", dir: "desc" },
    { id: "scheduled_oldest", label: "Scheduled: Oldest", field: "scheduled_at", dir: "asc" },
    { id: "created_newest", label: "Created: Newest", field: "created_at", dir: "desc" },
    { id: "created_oldest", label: "Created: Oldest", field: "created_at", dir: "asc" }
  ];

  const activeSortOption = SORT_OPTIONS.find(o => o.id === sortBy) || SORT_OPTIONS[0];

  const sortedPosts = [...posts].sort((a, b) => {
    const dateA = new Date(a[activeSortOption.field] || 0);
    const dateB = new Date(b[activeSortOption.field] || 0);
    return activeSortOption.dir === "desc" ? dateB - dateA : dateA - dateB;
  });

  return (
    <div className="client-approvals">
      <div className="approvals-header">
        <h1>Post Approvals</h1>
        <p>Review and approve posts before they go live on your social media.</p>
      </div>

      {/* Tabs + Sort */}
      <div className="approvals-tabs-row">
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
        <div className="sort-dropdown-wrapper">
          <button
            className="sort-toggle"
            onClick={() => setShowSortMenu(prev => !prev)}
          >
            {activeSortOption.dir === "desc" ? <FaSortAmountDown /> : <FaSortAmountUp />}
            <span>{activeSortOption.label}</span>
          </button>
          {showSortMenu && (
            <>
              <div className="sort-dropdown-backdrop" onClick={() => setShowSortMenu(false)} />
              <div className="sort-dropdown-menu">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={`sort-dropdown-item ${sortBy === option.id ? "active" : ""}`}
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
      </div>

      <div className="approvals-content">
        {/* Posts List */}
        <div className="posts-list">
          {loading ? (
            <div className="loading-state">Loading posts...</div>
          ) : sortedPosts.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✨</span>
              <p>No {
                activeTab === "pending_client" ? "posts awaiting your approval" :
                activeTab === "pending" ? "direct posts pending" :
                activeTab === "changes_requested" ? "posts with changes requested" :
                activeTab === "approved" ? "approved posts" :
                activeTab === "rejected" ? "rejected posts" :
                "posts"
              }</p>
            </div>
          ) : (
            sortedPosts.map((post) => (
              <div
                key={post.id}
                ref={(el) => postRefs.current[post.id] = el}
                className={`post-item ${selectedPost?.id === post.id ? "selected" : ""} ${highlightedPostId === post.id ? "highlighted" : ""}`}
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

              {/* Media Carousel */}
              {selectedPost.media_urls?.length > 0 && (() => {
                const urls = selectedPost.media_urls.filter(Boolean);
                const currentUrl = urls[mediaIndex] || urls[0];
                const isVideo = currentUrl?.match(/\.(mp4|mov|webm|avi)$/i);
                const total = urls.length;

                return (
                  <div className="detail-media-carousel">
                    <div className="carousel-frame">
                      {isVideo ? (
                        <video
                          key={currentUrl}
                          src={currentUrl}
                          controls
                          className="carousel-media"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            const fallback = e.target.nextSibling;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : (
                        <img
                          key={currentUrl}
                          src={currentUrl}
                          alt={`Media ${mediaIndex + 1}`}
                          className="carousel-media"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            const fallback = e.target.nextSibling;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      )}
                      <div className="carousel-fallback">
                        <span className="media-fallback-icon">🖼️</span>
                        <span className="media-fallback-text">Media unavailable</span>
                        <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="media-fallback-link">
                          View media
                        </a>
                      </div>

                      {/* Navigation arrows */}
                      {total > 1 && (
                        <>
                          <button
                            className="carousel-arrow carousel-arrow-left"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMediaIndex((prev) => (prev - 1 + total) % total);
                            }}
                            aria-label="Previous media"
                          >
                            <FaChevronLeft />
                          </button>
                          <button
                            className="carousel-arrow carousel-arrow-right"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMediaIndex((prev) => (prev + 1) % total);
                            }}
                            aria-label="Next media"
                          >
                            <FaChevronRight />
                          </button>
                        </>
                      )}

                      {/* Counter badge */}
                      {total > 1 && (
                        <div className="carousel-counter">
                          {mediaIndex + 1} / {total}
                        </div>
                      )}
                    </div>

                    {/* Dot indicators */}
                    {total > 1 && (
                      <div className="carousel-dots">
                        {urls.map((_, i) => (
                          <button
                            key={i}
                            className={`carousel-dot ${i === mediaIndex ? 'active' : ''}`}
                            onClick={() => setMediaIndex(i)}
                            aria-label={`Go to media ${i + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

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

              {/* Comments & Feedback Thread */}
              <div className="detail-comments">
                <h3>Comments & Feedback</h3>
                <div className="comments-scroll-container">
                  <CommentThread
                    postId={selectedPost.id}
                    workspaceId={activeWorkspace?.id}
                    enableRealtime={true}
                  />
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
