import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";
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
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [recentPosts, setRecentPosts] = useState([]);
  const [connectingPlatform, setConnectingPlatform] = useState(null);
  const [stats, setStats] = useState({
    apiCalls: 0,
    postsThisMonth: 0,
    connectedCount: 0
  });

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

  // Function to refresh connected accounts
  const refreshAccounts = async () => {
    if (!user) return;

    setLoadingAccounts(true);
    try {
      const res = await fetch(`${baseURL}/api/user-accounts?workspaceId=${activeWorkspace.id}`);
      if (res.ok) {
        const accountsData = await res.json();
        console.log("Connected accounts from API:", accountsData.accounts);
        setConnectedAccounts(accountsData.accounts || []);
        setStats(prev => ({ ...prev, connectedCount: accountsData.accounts?.length || 0 }));
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Function to handle connecting a platform
  const handleConnectPlatform = async (platformName) => {
    if (!user) return;

    // Prevent multiple simultaneous connections
    if (connectingPlatform) return;

    setConnectingPlatform(platformName);
    try {
      const res = await fetch(`${baseURL}/api/generate-jwt?workspaceId=${activeWorkspace.id}`);
      if (res.ok) {
        const data = await res.json();

        // Open in popup window instead of iframe (Ayrshare blocks iframe embedding)
        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;

        const popup = window.open(
          data.url,
          'Connect Social Account',
          `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );

        // Check if popup was blocked
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          alert('Please allow popups to connect your social accounts');
          setConnectingPlatform(null);
          return;
        }

        // Poll to detect when popup closes
        const pollTimer = setInterval(() => {
          if (popup.closed) {
            clearInterval(pollTimer);
            setConnectingPlatform(null);
            // Refresh accounts after popup closes
            setTimeout(() => refreshAccounts(), 1000);
          }
        }, 500);
      }
    } catch (error) {
      console.error("Error connecting platform:", error);
      setConnectingPlatform(null);
    }
  };

  // Fetch dashboard data in parallel
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) return;

      // Fetch accounts and posts in parallel
      const fetchAccounts = fetch(`${baseURL}/api/user-accounts?workspaceId=${activeWorkspace.id}`)
        .then(res => res.ok ? res.json() : null)
        .then(accountsData => {
          if (accountsData) {
            console.log("Connected accounts from API:", accountsData.accounts);
            setConnectedAccounts(accountsData.accounts || []);
            setStats(prev => ({ ...prev, connectedCount: accountsData.accounts?.length || 0 }));
          }
        })
        .catch(error => console.error("Error fetching accounts:", error))
        .finally(() => setLoadingAccounts(false));

      const fetchPosts = fetch(`${baseURL}/api/post-history?workspaceId=${activeWorkspace.id}`)
        .then(res => res.ok ? res.json() : null)
        .then(postsData => {
          if (postsData) {
            const posts = postsData.history || [];
            setRecentPosts(posts.slice(0, 5));

            const now = new Date();
            const thisMonthPosts = posts.filter(post => {
              const postDate = new Date(post.created || post.scheduleDate);
              return postDate.getMonth() === now.getMonth() &&
                     postDate.getFullYear() === now.getFullYear();
            });
            setStats(prev => ({
              ...prev,
              postsThisMonth: thisMonthPosts.length,
              apiCalls: posts.length
            }));
          }
        })
        .catch(error => console.error("Error fetching posts:", error))
        .finally(() => setLoadingPosts(false));

      await Promise.all([fetchAccounts, fetchPosts]);
    };

    fetchDashboardData();
  }, [user, activeWorkspace]);

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
          <div className="stat-value">{stats.apiCalls}</div>
          <div className="stat-period">All time</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Posts</div>
          <div className="stat-value">{stats.postsThisMonth}</div>
          <div className="stat-period">This month</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Connected Accounts</div>
          <div className="stat-value">{stats.connectedCount}</div>
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
                      className={`social-account-item ${!isConnected ? 'clickable' : ''}`}
                      onClick={() => !isConnected && handleConnectPlatform(account.name)}
                      style={{ cursor: !isConnected ? 'pointer' : 'default' }}
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
                          <div className="account-status">
                            {connectingPlatform === account.name
                              ? 'Connecting...'
                              : isConnected ? 'Connected' : 'Not connected - Click to connect'}
                          </div>
                        </div>
                      </div>
                      {isConnected ? (
                        <span className="status-badge active">
                          Active
                        </span>
                      ) : (
                        <button
                          className="connect-button"
                          disabled={connectingPlatform === account.name}
                        >
                          {connectingPlatform === account.name ? 'Connecting...' : 'Connect'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
