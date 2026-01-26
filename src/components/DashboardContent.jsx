import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useConnectedAccounts, useDashboardStats, useInvalidateQueries } from "../hooks/useQueries";
import { baseURL } from "../utils/constants";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import "./DashboardContent.css";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaReddit, FaTelegram, FaPinterest } from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { SiSnapchat } from "react-icons/si";
import { FaBluesky } from "react-icons/fa6";
import { SiX } from "react-icons/si";

const PLATFORM_ICONS = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  twitter: SiX,
  telegram: FaTelegram,
  pinterest: FaPinterest,
  reddit: FaReddit,
  bluesky: FaBluesky,
  snapchat: SiSnapchat
};

export const DashboardContent = () => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const { invalidateAccounts } = useInvalidateQueries();
  const [connectingPlatform, setConnectingPlatform] = useState(null);
  const [popupBlockedDialog, setPopupBlockedDialog] = useState({ isOpen: false, url: null });

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
    { name: "Telegram", icon: FaTelegram, key: "telegram", color: "#0088cc" },
    { name: "Pinterest", icon: FaPinterest, key: "pinterest", color: "#BD081C" },
    { name: "Reddit", icon: FaReddit, key: "reddit", color: "#FF4500" },
    { name: "BlueSky", icon: FaBluesky, key: "bluesky", color: "#1185FE" },
    { name: "Snapchat", icon: SiSnapchat, key: "snapchat", color: "#FFFC00" }
  ];

  // Function to refresh connected accounts (uses React Query cache invalidation)
  const refreshAccounts = () => {
    invalidateAccounts(activeWorkspace?.id || user?.id);
    refetchAccounts();
  };

  // Function to handle connecting a platform
  const handleConnectPlatform = async (platformName) => {
    if (!user) return;
    if (connectingPlatform) return;

    const queryParam = activeWorkspace?.id
      ? `workspaceId=${activeWorkspace.id}`
      : `userId=${user.id}`;

    setConnectingPlatform(platformName);
    try {
      const res = await fetch(`${baseURL}/api/generate-jwt?${queryParam}`);
      const data = await res.json();
      const url = data.data?.url || data.url;

      if (!res.ok || !url) {
        toast({
          title: "Connection failed",
          description: data.error || "Failed to connect. Please try again.",
          status: "error",
          duration: 4000,
          isClosable: true
        });
        setConnectingPlatform(null);
        return;
      }

      const width = 600;
      const height = 700;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;

      const popup = window.open(
        url,
        'Connect Social Account',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!popup || popup.closed) {
        setPopupBlockedDialog({ isOpen: true, url });
        setConnectingPlatform(null);
        return;
      }

      const pollTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollTimer);
          setConnectingPlatform(null);
          setTimeout(() => {
            refreshAccounts();
            window.dispatchEvent(new CustomEvent('socialAccountsUpdated'));
          }, 1000);
        }
      }, 500);
    } catch (error) {
      toast({
        title: "Connection failed",
        description: "Failed to connect. Please try again.",
        status: "error",
        duration: 4000,
        isClosable: true
      });
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
  }, []);

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
                  const postDate = new Date(post.created || post.scheduleDate);

                  return (
                    <div key={post.id} className="post-item">
                      <div className={`post-icon ${platform || 'instagram'}`}>
                        <Icon size={20} />
                      </div>
                      <div className="post-content">
                        <div className="post-text">
                          {post.post?.substring(0, 60)}{post.post?.length > 60 ? '...' : ''}
                        </div>
                        <div className="post-meta">
                          <span className={`post-status ${post.status === 'success' ? 'success' : 'pending'}`}>
                            Status: {post.status || 'scheduled'}
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
                    const normalizedAccount = ca.toLowerCase().replace(/[^a-z]/g, '');
                    const normalizedKey = account.key.toLowerCase().replace(/[^a-z]/g, '');
                    return normalizedAccount === normalizedKey ||
                           normalizedAccount.includes(normalizedKey) ||
                           normalizedKey.includes(normalizedAccount);
                  });

                  return (
                    <div
                      key={account.name}
                      className="social-account-item"
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
                          <div className="account-status" style={{ color: isConnected ? '#10b981' : '#999' }}>
                            {isConnected ? 'Connected' : 'Not connected'}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`status-badge ${isConnected ? 'active' : 'inactive'}`}
                        style={{
                          backgroundColor: isConnected ? '#afabf9' : '#fee2e2',
                          color: isConnected ? '#114C5A' : '#dc2626',
                          padding: '6px 16px',
                          borderRadius: '20px',
                          fontWeight: '600',
                          fontSize: '13px'
                        }}
                      >
                        {isConnected ? 'ACTIVE' : 'NO CONNECTION'}
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
