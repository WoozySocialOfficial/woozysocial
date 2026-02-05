import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useAuth } from "../../contexts/AuthContext";
import { useClientDashboardStats } from "../../hooks/useQueries";
import { FaChevronRight } from "react-icons/fa";
import "./ClientDashboard.css";

export const ClientDashboard = () => {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Use React Query for cached data fetching
  const { data, isLoading: loading } = useClientDashboardStats(
    activeWorkspace?.id,
    user?.id
  );

  const stats = data?.stats || {
    pending: 0,
    changesRequested: 0,
    approved: 0,
    rejected: 0
  };
  const recentActivity = data?.recentActivity || [];

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

  const handleActivityClick = (post) => {
    const status = post.status;

    if (status === 'pending_approval' || status === 'changes_requested') {
      navigate('/client/approvals', {
        state: {
          postId: post.id,
          tab: status === 'pending_approval' ? 'pending' : 'changes_requested'
        }
      });
    } else if (status === 'approved' || status === 'rejected') {
      navigate('/client/approved', {
        state: {
          postId: post.id,
          filter: status
        }
      });
    } else if (status === 'scheduled') {
      navigate('/client/calendar', {
        state: {
          postId: post.id,
          scheduledDate: post.scheduled_at || post.schedule_date
        }
      });
    } else if (status === 'posted') {
      navigate('/client/approved', {
        state: {
          postId: post.id,
          filter: 'approved'
        }
      });
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
              <div
                key={post.id}
                className="activity-item clickable"
                onClick={() => handleActivityClick(post)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleActivityClick(post);
                  }
                }}
              >
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
                <div className="activity-arrow">
                  <FaChevronRight size={14} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
