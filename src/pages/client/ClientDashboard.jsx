import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useAuth } from "../../contexts/AuthContext";
import { baseURL } from "../../utils/constants";
import "./ClientDashboard.css";

export const ClientDashboard = () => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [stats, setStats] = useState({
    pending: 0,
    changesRequested: 0,
    approved: 0,
    rejected: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!activeWorkspace || !user) return;

      try {
        setLoading(true);

        // Fetch all posts to get accurate stats
        const res = await fetch(
          `${baseURL}/api/post/pending-approvals?workspaceId=${activeWorkspace.id}&userId=${user.id}&status=all`
        );

        if (res.ok) {
          const data = await res.json();
          const responseData = data.data || data;

          setStats({
            pending: responseData.counts?.pending || 0,
            changesRequested: responseData.counts?.changes_requested || 0,
            approved: responseData.counts?.approved || 0,
            rejected: responseData.counts?.rejected || 0
          });

          // Get recent posts for activity
          const allPosts = [
            ...(responseData.grouped?.pending || []),
            ...(responseData.grouped?.changes_requested || []),
            ...(responseData.grouped?.approved || []),
            ...(responseData.grouped?.rejected || [])
          ];

          // Sort by date and take last 5
          const sorted = allPosts
            .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
            .slice(0, 5);

          setRecentActivity(sorted);
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [activeWorkspace, user]);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending_approval': return '#f59e0b';
      case 'changes_requested': return '#ef4444';
      case 'approved': return '#10b981';
      case 'rejected': return '#dc2626';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending_approval': return 'Pending';
      case 'changes_requested': return 'Changes Requested';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="client-dashboard">
        <div className="loading-state">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="client-dashboard">
      <div className="dashboard-header">
        <h1>Welcome to Your Client Portal</h1>
        <p>Review and approve posts scheduled for your social media accounts.</p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <Link to="/client/approvals" className="stat-card pending">
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <div className="stat-number">{stats.pending}</div>
            <div className="stat-label">Awaiting Approval</div>
          </div>
        </Link>

        <div className="stat-card changes">
          <div className="stat-icon">📝</div>
          <div className="stat-content">
            <div className="stat-number">{stats.changesRequested}</div>
            <div className="stat-label">Changes Requested</div>
          </div>
        </div>

        <Link to="/client/approved" className="stat-card approved">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-number">{stats.approved}</div>
            <div className="stat-label">Approved</div>
          </div>
        </Link>

        <div className="stat-card rejected">
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <div className="stat-number">{stats.rejected}</div>
            <div className="stat-label">Rejected</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions-section">
        <h2>Quick Actions</h2>
        <div className="quick-actions-grid">
          <Link to="/compose" className="quick-action-card">
            <span className="action-icon">✍️</span>
            <span className="action-text">New Post</span>
          </Link>

          <Link to="/compose" className="quick-action-card">
            <span className="action-icon">🤖</span>
            <span className="action-text">AI Generate</span>
          </Link>

          <Link to="/brand-profile" className="quick-action-card">
            <span className="action-icon">🏢</span>
            <span className="action-text">Brand Profile</span>
          </Link>

          <Link to="/schedule" className="quick-action-card">
            <span className="action-icon">📆</span>
            <span className="action-text">View Schedule</span>
          </Link>

          <Link to="/client/approvals" className="quick-action-card">
            <span className="action-icon">📋</span>
            <span className="action-text">Review Pending Posts</span>
            {stats.pending > 0 && (
              <span className="action-badge">{stats.pending}</span>
            )}
          </Link>

          <Link to="/client/calendar" className="quick-action-card">
            <span className="action-icon">📅</span>
            <span className="action-text">View Calendar</span>
          </Link>

          <Link to="/client/approved" className="quick-action-card">
            <span className="action-icon">📜</span>
            <span className="action-text">View Post History</span>
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="recent-activity-section">
        <h2>Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <div className="empty-activity">
            <p>No recent activity to display.</p>
          </div>
        ) : (
          <div className="activity-list">
            {recentActivity.map((post) => (
              <div key={post.id} className="activity-item">
                <div className="activity-content">
                  <div className="activity-caption">
                    {post.caption?.substring(0, 80) || 'No caption'}
                    {post.caption?.length > 80 && '...'}
                  </div>
                  <div className="activity-meta">
                    <span
                      className="activity-status"
                      style={{ backgroundColor: getStatusColor(post.status) }}
                    >
                      {getStatusLabel(post.status)}
                    </span>
                    <span className="activity-date">
                      {formatDate(post.updated_at || post.created_at)}
                    </span>
                    {post.platforms && (
                      <span className="activity-platforms">
                        {post.platforms.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
