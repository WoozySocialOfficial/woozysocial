import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaPinterest, FaArrowUp, FaArrowDown } from "react-icons/fa";
import { FaTiktok, FaBluesky } from "react-icons/fa6";
import { SiX } from "react-icons/si";
import "./AnalyticsContent.css";

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

const PLATFORM_COLORS = {
  facebook: "#1877F2",
  instagram: "#E4405F",
  linkedin: "#0A66C2",
  youtube: "#FF0000",
  tiktok: "#000000",
  twitter: "#000000",
  pinterest: "#BD081C",
  bluesky: "#1185FE"
};

export const AnalyticsContent = () => {
  const { activeWorkspace } = useWorkspace();
  const [period, setPeriod] = useState("30");

  // Fetch analytics data
  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ["analytics", activeWorkspace?.id, period],
    queryFn: async () => {
      const res = await fetch(
        `${baseURL}/api/analytics?workspaceId=${activeWorkspace?.id}&period=${period}`
      );
      if (!res.ok) throw new Error("Failed to fetch analytics");
      const json = await res.json();
      return json.data || json;
    },
    enabled: !!activeWorkspace?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Fetch best time recommendations
  const { data: bestTimeData } = useQuery({
    queryKey: ["bestTime", activeWorkspace?.id],
    queryFn: async () => {
      const res = await fetch(
        `${baseURL}/api/best-time?workspaceId=${activeWorkspace?.id}`
      );
      if (!res.ok) throw new Error("Failed to fetch best times");
      const json = await res.json();
      return json.data || json;
    },
    enabled: !!activeWorkspace?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const summary = analyticsData?.summary || {
    totalPosts: 0,
    totalEngagements: 0,
    totalImpressions: 0,
    avgEngagement: 0,
    trendPercent: 0
  };

  const platformStats = analyticsData?.platformStats || [];
  const dailyStats = analyticsData?.dailyStats || [];
  const topPosts = analyticsData?.topPosts || [];
  const bestTimes = bestTimeData?.recommendations || [];

  // Format daily stats for chart
  const chartData = dailyStats.map(day => ({
    ...day,
    date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }));

  // Format platform data for pie chart
  const pieData = platformStats.slice(0, 5).map(p => ({
    name: p.platform.charAt(0).toUpperCase() + p.platform.slice(1),
    value: p.engagements,
    color: PLATFORM_COLORS[p.platform] || "#666"
  }));

  return (
    <div className="analytics-content">
      {/* Header */}
      <div className="analytics-header">
        <div className="header-left">
          <h2 className="analytics-title">Analytics</h2>
          <p className="analytics-subtitle">Track your social media performance</p>
        </div>
        <div className="period-selector">
          <button
            className={`period-btn ${period === "7" ? "active" : ""}`}
            onClick={() => setPeriod("7")}
          >
            7 Days
          </button>
          <button
            className={`period-btn ${period === "30" ? "active" : ""}`}
            onClick={() => setPeriod("30")}
          >
            30 Days
          </button>
          <button
            className={`period-btn ${period === "90" ? "active" : ""}`}
            onClick={() => setPeriod("90")}
          >
            90 Days
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="analytics-stats">
        <div className="stat-card">
          <div className="stat-label">Total Posts</div>
          <div className={`stat-value ${isLoading ? "skeleton" : ""}`}>
            {isLoading ? "" : summary.totalPosts}
          </div>
          <div className="stat-period">Last {period} days</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Engagements</div>
          <div className={`stat-value ${isLoading ? "skeleton" : ""}`}>
            {isLoading ? "" : summary.totalEngagements.toLocaleString()}
          </div>
          <div className={`stat-trend ${summary.trendPercent >= 0 ? "positive" : "negative"}`}>
            {summary.trendPercent >= 0 ? <FaArrowUp /> : <FaArrowDown />}
            {Math.abs(summary.trendPercent)}% vs previous
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg. Engagement/Post</div>
          <div className={`stat-value ${isLoading ? "skeleton" : ""}`}>
            {isLoading ? "" : summary.avgEngagement}
          </div>
          <div className="stat-period">Per post average</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Impressions</div>
          <div className={`stat-value ${isLoading ? "skeleton" : ""}`}>
            {isLoading ? "" : summary.totalImpressions.toLocaleString()}
          </div>
          <div className="stat-period">Total reach</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="analytics-grid">
        {/* Engagement Over Time Chart */}
        <div className="chart-card full-width">
          <div className="chart-header">
            <h3 className="chart-title">Engagement Over Time</h3>
            <p className="chart-subtitle">Daily posts and engagement metrics</p>
          </div>
          <div className="chart-container">
            {isLoading ? (
              <div className="chart-loading">Loading chart...</div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#afabf9" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#afabf9" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPosts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e0e0e0",
                      borderRadius: "8px"
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="engagements"
                    stroke="#afabf9"
                    fillOpacity={1}
                    fill="url(#colorEngagement)"
                    name="Engagements"
                  />
                  <Area
                    type="monotone"
                    dataKey="posts"
                    stroke="#7c3aed"
                    fillOpacity={1}
                    fill="url(#colorPosts)"
                    name="Posts"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="no-data">No data available for this period</div>
            )}
          </div>
        </div>

        {/* Platform Performance */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Platform Performance</h3>
            <p className="chart-subtitle">Engagement by platform</p>
          </div>
          <div className="chart-container">
            {isLoading ? (
              <div className="chart-loading">Loading...</div>
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="no-data">No platform data available</div>
            )}
          </div>
        </div>

        {/* Best Time to Post */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Best Time to Post</h3>
            <p className="chart-subtitle">
              {bestTimeData?.source === "personalized"
                ? "Based on your posting history"
                : "Industry best practices"}
            </p>
          </div>
          <div className="best-times-list">
            {bestTimes.slice(0, 5).map((time, index) => (
              <div key={index} className="best-time-item">
                <div className="best-time-rank">{index + 1}</div>
                <div className="best-time-info">
                  <span className="best-time-day">{time.day}</span>
                  <span className="best-time-hour">{time.time}</span>
                </div>
                <div className="best-time-score">
                  <div
                    className="score-bar"
                    style={{ width: `${time.score}%` }}
                  />
                  <span className="score-text">{time.score}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Platform Breakdown */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Platform Breakdown</h3>
            <p className="chart-subtitle">Detailed stats by platform</p>
          </div>
          <div className="platform-stats-list">
            {platformStats.length > 0 ? (
              platformStats.map((platform) => {
                const Icon = PLATFORM_ICONS[platform.platform] || FaInstagram;
                return (
                  <div key={platform.platform} className="platform-stat-item">
                    <div className="platform-info">
                      <div
                        className="platform-icon"
                        style={{ backgroundColor: PLATFORM_COLORS[platform.platform] || "#666" }}
                      >
                        <Icon size={16} color="white" />
                      </div>
                      <span className="platform-name">
                        {platform.platform.charAt(0).toUpperCase() + platform.platform.slice(1)}
                      </span>
                    </div>
                    <div className="platform-metrics">
                      <div className="metric">
                        <span className="metric-value">{platform.posts}</span>
                        <span className="metric-label">Posts</span>
                      </div>
                      <div className="metric">
                        <span className="metric-value">{platform.likes}</span>
                        <span className="metric-label">Likes</span>
                      </div>
                      <div className="metric">
                        <span className="metric-value">{platform.comments}</span>
                        <span className="metric-label">Comments</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="no-data">No platform data available</div>
            )}
          </div>
        </div>

        {/* Top Performing Posts */}
        <div className="chart-card full-width">
          <div className="chart-header">
            <h3 className="chart-title">Top Performing Posts</h3>
            <p className="chart-subtitle">Your highest engagement content</p>
          </div>
          <div className="top-posts-list">
            {topPosts.length > 0 ? (
              topPosts.map((post, index) => (
                <div key={post.id || index} className="top-post-item">
                  <div className="top-post-rank">#{index + 1}</div>
                  <div className="top-post-content">
                    <p className="top-post-text">{post.text || "No text available"}</p>
                    <div className="top-post-meta">
                      {post.platforms?.map((p) => {
                        const Icon = PLATFORM_ICONS[p.toLowerCase()] || FaInstagram;
                        return (
                          <span key={p} className="post-platform-badge">
                            <Icon size={12} />
                          </span>
                        );
                      })}
                      <span className="top-post-date">
                        {post.date ? new Date(post.date).toLocaleDateString() : ""}
                      </span>
                    </div>
                  </div>
                  <div className="top-post-engagement">
                    <span className="engagement-value">{post.engagements}</span>
                    <span className="engagement-label">engagements</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-data">No posts with engagement data yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsContent;
