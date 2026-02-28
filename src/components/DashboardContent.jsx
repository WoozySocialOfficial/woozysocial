import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useConnectedAccounts, useDashboardStats, useInvalidateQueries } from "../hooks/useQueries";
import { baseURL } from "../utils/constants";

import { ConfirmDialog } from "./ui/ConfirmDialog";
import "./DashboardContent.css";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaPinterest, FaGoogle } from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { FaBluesky } from "react-icons/fa6";
import { SiX } from "react-icons/si";

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  twitter: SiX,
  pinterest: FaPinterest,
  bluesky: FaBluesky
};

// Status labels and colors (matching Approvals page)
const STATUS_CONFIG = {
  pending: { label: 'Pending Approval', color: '#afabf9', textColor: '#114C5A' },
  approved: { label: 'Approved', color: '#10b981', textColor: '#FFFFFF' },
  rejected: { label: 'Rejected', color: '#ef4444', textColor: '#FFFFFF' },
  changes_requested: { label: 'Change Requested', color: '#f59e0b', textColor: '#FFFFFF' },
  scheduled: { label: 'Scheduled', color: '#3b82f6', textColor: '#FFFFFF' },
  posted: { label: 'Posted', color: '#10b981', textColor: '#FFFFFF' },
  failed: { label: 'Failed', color: '#ef4444', textColor: '#FFFFFF' }
};

export const DashboardContent = () => {
  const { user } = useAuth();
  const { activeWorkspace, canApprovePost } = useWorkspace();
  const navigate = useNavigate();
  const { invalidateAccounts } = useInvalidateQueries();
  const [popupBlockedDialog, setPopupBlockedDialog] = useState({ isOpen: false, url: null });
  const [connectingPlatform, setConnectingPlatform] = useState(null);

  // Use React Query for connected accounts (cached!)
  const {
    data: accountsData,
    isLoading: loadingAccounts,
    refetch: refetchAccounts
  } = useConnectedAccounts(activeWorkspace?.id, user?.id);

  // Use React Query for dashboard stats (cached!)
  const {
    data: statsData,
    isLoading: loadingPosts
  } = useDashboardStats(activeWorkspace?.id, user?.id);

  const connectedAccounts = accountsData?.accounts || [];
  const recentPosts = statsData?.recentPosts || [];
  const stats = {
    apiCalls: statsData?.totalPosts || 0,
    postsThisMonth: statsData?.postsThisMonth || 0,
    connectedCount: connectedAccounts.length
  };

  const socialAccounts = [
    { name: "Facebook", icon: FaFacebookF, key: "facebook", color: "#1877F2" },
    { name: "LinkedIn", icon: FaLinkedinIn, key: "linkedin", color: "#0A66C2" },
    { name: "Instagram", icon: FaInstagram, key: "instagram", color: "#E4405F" },
    { name: "Twitter/X", icon: SiX, key: "twitter", color: "#000000" },
    { name: "TikTok", icon: FaTiktok, key: "tiktok", color: "#000000" },
    { name: "YouTube", icon: FaYoutube, key: "youtube", color: "#FF0000" },
    { name: "Pinterest", icon: FaPinterest, key: "pinterest", color: "#BD081C" },
    { name: "BlueSky", icon: FaBluesky, key: "bluesky", color: "#1185FE" },
    { name: "Google Business", icon: FaGoogle, key: "googlebusiness", color: "#4285F4" }
  ];

  // Function to refresh connected accounts (uses React Query cache invalidation)
  const refreshAccounts = () => {
    invalidateAccounts(activeWorkspace?.id || user?.id);
    refetchAccounts();
  };

  // Invalidate backend KV cache so next fetch hits Ayrshare fresh
  const invalidateServerCache = async () => {
    try {
      const res = await fetch(
        `${baseURL}/api/user-accounts?workspaceId=${activeWorkspace.id}`
      );
      if (res.ok) {
        const data = await res.json();
        // The profile key is used as the KV cache key — fetch it to invalidate
        await fetch(`${baseURL}/api/cache/invalidate-accounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileKey: activeWorkspace.ayr_profile_key })
        }).catch(() => {});
      }
    } catch {
      // Ignore — best effort
    }
  };

  const handleConnectPlatform = async (platformName) => {
    if (!activeWorkspace?.id || connectingPlatform) return;
    setConnectingPlatform(platformName);
    try {
      const r = await fetch(`${baseURL}/api/generate-jwt?workspaceId=${activeWorkspace.id}`);
      if (!r.ok) throw new Error("Failed to generate link");
      const d = await r.json();
      const url = d.data?.url || d.url;

      const width = 900, height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const popup = window.open(
        url, "AyrshareLink",
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`
      );

      if (!popup || popup.closed) {
        setPopupBlockedDialog({ isOpen: true, url });
        setConnectingPlatform(null);
        return;
      }

      // Snapshot current accounts before popup
      const accountsBefore = new Set(connectedAccounts);

      const pollTimer = setInterval(async () => {
        try {
          if (popup.closed) {
            clearInterval(pollTimer);

            // Invalidate server-side KV cache first
            await invalidateServerCache();

            // Poll for new account with retries (like SocialAccounts page)
            let attempts = 0;
            const maxAttempts = 6;

            const checkForNewAccount = async () => {
              invalidateAccounts(activeWorkspace.id);
              const { data } = await refetchAccounts();
              const currentAccounts = data?.accounts || [];
              const hasNew = currentAccounts.some(a => !accountsBefore.has(a));

              if (hasNew) {
                setConnectingPlatform(null);
                window.dispatchEvent(new CustomEvent('socialAccountsUpdated'));
                return;
              }

              attempts++;
              if (attempts < maxAttempts) {
                setTimeout(checkForNewAccount, 2000);
              } else {
                setConnectingPlatform(null);
              }
            };

            // Give Ayrshare a moment to propagate
            setTimeout(checkForNewAccount, 1500);
          }
        } catch { clearInterval(pollTimer); setConnectingPlatform(null); }
      }, 500);
    } catch (error) {
      console.error("Error connecting platform:", error);
      setConnectingPlatform(null);
    }
  };

  const handleOpenInNewTab = () => {
    if (popupBlockedDialog.url) {
      window.open(popupBlockedDialog.url, '_blank');
    }
    setPopupBlockedDialog({ isOpen: false, url: null });
  };

  // Listen for social accounts updates from other components (e.g., TopHeader)
  useEffect(() => {
    const handleAccountsUpdated = () => {
      setTimeout(() => refreshAccounts(), 1000);
    };

    window.addEventListener('socialAccountsUpdated', handleAccountsUpdated);
    return () => window.removeEventListener('socialAccountsUpdated', handleAccountsUpdated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper function to handle post click navigation
  const handlePostClick = (post) => {
    const approvalStatus = post.approval_status;
    const postStatus = post.status;

    // Priority 1: Check approval status first
    if (approvalStatus === 'pending' && canApprovePost) {
      // Admin/owner → go to approvals page
      navigate('/approvals');
    } else if (approvalStatus === 'changes_requested') {
      // Anyone → go to compose to edit - store data in sessionStorage
      sessionStorage.setItem("loadDraft", JSON.stringify({
        id: post.id,
        caption: post.post || post.caption || post.content,
        media_urls: post.mediaUrls || post.media_urls || (post.media_url ? [post.media_url] : []),
        platforms: post.platforms || [],
        scheduled_date: post.scheduleDate || post.scheduled_at || post.schedule_date,
        post_settings: post.post_settings || {},
        workspace_id: activeWorkspace.id,
        isEditingScheduledPost: true,
        approval_status: 'changes_requested'
      }));
      navigate('/compose');
    } else if (approvalStatus === 'rejected') {
      // Rejected → go to compose to revise - store data in sessionStorage
      sessionStorage.setItem("loadDraft", JSON.stringify({
        id: post.id,
        caption: post.post || post.caption || post.content,
        media_urls: post.mediaUrls || post.media_urls || (post.media_url ? [post.media_url] : []),
        platforms: post.platforms || [],
        scheduled_date: post.scheduleDate || post.scheduled_at || post.schedule_date,
        post_settings: post.post_settings || {},
        workspace_id: activeWorkspace.id,
        isEditingScheduledPost: true,
        approval_status: 'rejected'
      }));
      navigate('/compose');
    }
    // Priority 2: Check post status
    else if (postStatus === 'scheduled') {
      navigate('/schedule');
    } else if (postStatus === 'posted') {
      navigate('/schedule');
    } else if (postStatus === 'failed') {
      navigate('/posts');
    }
    // Default: go to schedule
    else {
      navigate('/schedule');
    }
  };

  // Helper function to determine display status
  const getDisplayStatus = (post) => {
    // Approval status takes priority
    if (post.approval_status && post.approval_status !== 'approved') {
      return post.approval_status;
    }
    // Then post status
    return post.status || 'scheduled';
  };

  return (
    <div className="dashboard-content">
      {/* Header */}
      <div className="dashboard-header">
        <h2 className="dashboard-title">Dashboard</h2>
        <p className="dashboard-subtitle">Overview of your social media performance</p>
      </div>

      {/* Top Stats Row */}
      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-label">Total Posts</div>
          <div className={`stat-value ${loadingPosts ? 'skeleton' : ''}`}>
            {loadingPosts ? '' : stats.apiCalls}
          </div>
          <div className="stat-period">All time</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Posts</div>
          <div className={`stat-value ${loadingPosts ? 'skeleton' : ''}`}>
            {loadingPosts ? '' : stats.postsThisMonth}
          </div>
          <div className="stat-period">This month</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Connected Accounts</div>
          <div className={`stat-value ${loadingAccounts ? 'skeleton' : ''}`}>
            {loadingAccounts ? '' : stats.connectedCount}
          </div>
          <div className="stat-period">Active</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-main-grid">
        {/* Left Column - Quick Actions and Recent Posts */}
        <div className="dashboard-left">
          {/* Quick Actions */}
          <div className="quick-actions-section">
            <div className="section-header">
              <h3 className="section-title">Quick Actions</h3>
              <p className="section-subtitle">Common tasks and shortcuts</p>
            </div>
            <div className="quick-actions-grid">
              <button className="action-btn primary" onClick={() => navigate('/compose')}>
                New Post
              </button>
              <button className="action-btn" onClick={() => navigate('/compose')}>
                AI Generate
              </button>
              <button className="action-btn" onClick={() => navigate('/brand-profile')}>
                Brand Profile
              </button>
              <button className="action-btn" onClick={() => navigate('/schedule')}>
                View Schedule
              </button>
            </div>
          </div>

          {/* Recent Posts */}
          <div className="recent-posts-section">
            <div className="section-header">
              <h3 className="section-title">Recent Posts</h3>
              <p className="section-subtitle">Your latest social media activity</p>
            </div>
            <div className="recent-posts-list">
              {loadingPosts ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  Loading posts...
                </div>
              ) : recentPosts.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  No posts yet. Create your first post!
                </div>
              ) : (
                recentPosts.map((post) => {
                  const platform = post.platforms?.[0]?.toLowerCase();
                  const Icon = PLATFORM_ICONS[platform] || FaInstagram;
                  const postDate = new Date(post.created || post.scheduleDate || post.scheduled_for);
                  const displayStatus = getDisplayStatus(post);
                  const statusConfig = STATUS_CONFIG[displayStatus] || {
                    label: displayStatus,
                    color: '#6b7280',
                    textColor: '#FFFFFF'
                  };

                  return (
                    <div
                      key={post.id}
                      className="post-item clickable"
                      onClick={() => handlePostClick(post)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className={`post-icon ${platform || 'instagram'}`}>
                        <Icon size={20} />
                      </div>
                      <div className="post-content">
                        <div className="post-text">
                          {(post.post || post.caption || post.content || 'No content')?.substring(0, 60)}
                          {(post.post || post.caption || post.content || '')?.length > 60 ? '...' : ''}
                        </div>
                        <div className="post-meta">
                          <span
                            className="post-status-badge"
                            style={{
                              backgroundColor: statusConfig.color,
                              color: statusConfig.textColor,
                              padding: '4px 12px',
                              borderRadius: '12px',
                              fontWeight: '600',
                              fontSize: '11px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}
                          >
                            {statusConfig.label}
                          </span>
                          <span className="post-platforms">
                            {post.platforms?.length || 0} platform{post.platforms?.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="post-date">
                        {postDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Social Accounts */}
        <div className="dashboard-right">
          {/* All Accounts */}
          <div className="social-accounts-section">
            <div className="section-header">
              <h3 className="section-title">All Platforms</h3>
              <p className="section-subtitle">Manage your connections</p>
            </div>
            <div className="social-accounts-list">
              {loadingAccounts ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  Loading platforms...
                </div>
              ) : (
                socialAccounts.map((account) => {
                  const Icon = account.icon;
                  // More flexible matching to handle variations in platform names
                  const isConnected = connectedAccounts.some(ca => {
                    let normalizedAccount = ca.toLowerCase().replace(/[^a-z]/g, '');
                    // Ayrshare uses 'gmb' as the identifier for Google Business Profile
                    if (normalizedAccount === 'gmb') normalizedAccount = 'googlebusiness';
                    const normalizedKey = account.key.toLowerCase().replace(/[^a-z]/g, '');
                    return normalizedAccount === normalizedKey ||
                           normalizedAccount.includes(normalizedKey) ||
                           normalizedKey.includes(normalizedAccount);
                  });

                  const isConnecting = connectingPlatform === account.name;

                  return (
                    <div
                      key={account.name}
                      className="social-account-item"
                      onClick={() => handleConnectPlatform(account.name)}
                      style={{ cursor: 'pointer' }}
                      title={isConnected ? `Manage ${account.name} connection` : `Connect ${account.name}`}
                    >
                      <div className="account-info">
                        <div
                          className="account-icon"
                          style={{ backgroundColor: account.color }}
                        >
                          <Icon size={20} color="white" />
                        </div>
                        <div className="account-details">
                          <div className="account-name">{account.name}</div>
                          <div className={`account-status ${isConnected ? 'connected' : ''}`}>
                            {isConnecting ? 'Connecting...' : isConnected ? 'Connected' : 'Not connected'}
                          </div>
                        </div>
                      </div>
                      <span className={`status-badge ${isConnected ? 'active' : isConnecting ? 'connecting' : 'inactive'}`}>
                        {isConnecting ? 'CONNECTING...' : isConnected ? 'ACTIVE' : 'NO CONNECTION'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={popupBlockedDialog.isOpen}
        onClose={() => setPopupBlockedDialog({ isOpen: false, url: null })}
        onConfirm={handleOpenInNewTab}
        title="Popup Blocked"
        message="The popup was blocked by your browser. Would you like to open the connection page in a new tab instead? You can also allow popups for this site in your browser settings."
        confirmText="Open in New Tab"
        cancelText="Cancel"
        confirmVariant="primary"
      />
    </div>
  );
};
