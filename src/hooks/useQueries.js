import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { baseURL } from "../utils/constants";
import { supabase } from "../utils/supabaseClient";

// ============================================
// SOCIAL ACCOUNTS
// ============================================

export function useConnectedAccounts(workspaceId, userId) {
  return useQuery({
    queryKey: ["connectedAccounts", workspaceId || userId],
    queryFn: async () => {
      const queryParam = workspaceId
        ? `workspaceId=${workspaceId}`
        : `userId=${userId}`;
      const res = await fetch(`${baseURL}/api/user-accounts?${queryParam}`);
      if (!res.ok) throw new Error("Failed to fetch accounts");
      const data = await res.json();
      return data.data || data;
    },
    enabled: !!(workspaceId || userId),
    staleTime: 1000 * 30, // 30 seconds - needs to refresh quickly after connecting
  });
}

// ============================================
// POSTS
// ============================================

export function usePosts(workspaceId, userId, options = {}) {
  const { status, approvalStatus, limit = 50, enabled = true } = options;

  return useQuery({
    queryKey: ["posts", workspaceId, status, approvalStatus, limit],
    queryFn: async () => {
      let query = supabase
        .from("posts")
        .select("*")
        .eq("workspace_id", workspaceId);

      if (status) {
        query = query.eq("status", status);
      }

      // NEW: Filter by approval status
      if (approvalStatus) {
        const statuses = Array.isArray(approvalStatus) ? approvalStatus : [approvalStatus];
        query = query.in("approval_status", statuses);
      }

      // Order by appropriate field based on status
      if (status === "scheduled") {
        query = query.order("scheduled_at", { ascending: true });
      } else if (status === "posted") {
        query = query.order("posted_at", { ascending: false });
      } else if (approvalStatus) {
        // For pending approvals, order by created_at (most recent first)
        query = query.order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId && enabled,
    staleTime: 1000 * 30, // 30 seconds - posts change more frequently
  });
}

export function useScheduledPosts(workspaceId, userId) {
  return useQuery({
    queryKey: ["scheduledPosts", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("status", "scheduled")
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 30,
  });
}

export function usePendingApprovals(workspaceId, userId, status = "pending") {
  return useQuery({
    queryKey: ["pendingApprovals", workspaceId, status],
    queryFn: async () => {
      const res = await fetch(
        `${baseURL}/api/post/pending-approvals?workspaceId=${workspaceId}&userId=${userId}&status=${status}`
      );
      if (!res.ok) throw new Error("Failed to fetch pending approvals");
      const data = await res.json();
      const responseData = data.data || data;
      return responseData.grouped?.[status] || [];
    },
    enabled: !!(workspaceId && userId),
    staleTime: 1000 * 15, // 15 seconds - approvals are time-sensitive
  });
}

export function useUnifiedSchedule(workspaceId, userId, status = "all") {
  return useQuery({
    queryKey: ["unifiedSchedule", workspaceId, status],
    queryFn: async () => {
      const res = await fetch(
        `${baseURL}/api/post/unified-schedule?workspaceId=${workspaceId}&userId=${userId}&status=${status}`
      );
      if (!res.ok) throw new Error("Failed to fetch schedule");
      const data = await res.json();
      const responseData = data.data || data;
      return responseData.posts || [];
    },
    enabled: !!(workspaceId && userId),
    staleTime: 1000 * 30, // 30 seconds
  });
}

// ============================================
// DRAFTS
// ============================================

export function useDrafts(workspaceId, userId, options = {}) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: ["drafts", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("post_drafts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId && enabled,
    staleTime: 1000 * 60, // 1 minute
  });
}

// ============================================
// AGENCY TEAM (Central Roster)
// ============================================

export function useAgencyTeam(userId) {
  return useQuery({
    queryKey: ["agencyTeam", userId],
    queryFn: async () => {
      const res = await fetch(`${baseURL}/api/agency-team/list?userId=${userId}`);
      if (!res.ok) throw new Error("Failed to fetch agency team");
      const data = await res.json();
      return data.data?.teamMembers || [];
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

/**
 * Returns full agency access context: team members + ownership/manager info.
 * Used by components that need to know if the user is an owner or delegated manager.
 */
export function useAgencyAccess(userId) {
  return useQuery({
    queryKey: ["agencyAccess", userId],
    queryFn: async () => {
      const res = await fetch(`${baseURL}/api/agency-team/list?userId=${userId}`);
      if (!res.ok) {
        // User has no agency access — return null (not an error)
        return null;
      }
      const data = await res.json();
      if (!data.success) return null;
      return {
        teamMembers: data.data?.teamMembers || [],
        agencyOwnerId: data.data?.agencyOwnerId || null,
        isOwner: data.data?.isOwner || false,
        isManager: data.data?.isManager || false,
        hasAccess: !!(data.data?.agencyOwnerId)
      };
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  });
}

// ============================================
// TEAM MEMBERS
// ============================================

export function useTeamMembers(workspaceId, userId) {
  return useQuery({
    queryKey: ["teamMembers", workspaceId],
    queryFn: async () => {
      const res = await fetch(`${baseURL}/api/workspaces/${workspaceId}/members?userId=${userId}`);
      if (!res.ok) throw new Error("Failed to fetch team members");
      const data = await res.json();
      const responseData = data.data || data;
      return responseData.members || [];
    },
    enabled: !!(workspaceId && userId),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

export function usePendingInvites(workspaceId, userId) {
  return useQuery({
    queryKey: ["pendingInvites", workspaceId],
    queryFn: async () => {
      const res = await fetch(`${baseURL}/api/invitations/list?workspaceId=${workspaceId}&userId=${userId}`);
      if (!res.ok) throw new Error("Failed to fetch pending invites");
      const data = await res.json();
      return data.data?.invitations || data.invitations || [];
    },
    enabled: !!(workspaceId && userId),
    staleTime: 1000 * 60, // 1 minute
  });
}

// ============================================
// NOTIFICATIONS
// ============================================

export function useNotifications(userId, workspaceId, options = {}) {
  const { unreadOnly = false } = options;

  return useQuery({
    queryKey: ["notifications", userId, workspaceId, unreadOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ userId });
      if (workspaceId) params.append("workspaceId", workspaceId);
      if (unreadOnly) params.append("unreadOnly", "true");

      const res = await fetch(`${baseURL}/api/notifications?${params}`);
      if (!res.ok) throw new Error("Failed to fetch notifications");
      const data = await res.json();
      return data.data || data;
    },
    enabled: !!userId,
    staleTime: 1000 * 30, // 30 seconds
  });
}

// ============================================
// BRAND PROFILE
// ============================================

export function useBrandProfile(workspaceId) {
  return useQuery({
    queryKey: ["brandProfile", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return data || null;
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes - brand profile rarely changes
  });
}


// ============================================
// CLIENT PORTAL
// ============================================

// Client Dashboard Stats - fetches all approval counts at once
export function useClientDashboardStats(workspaceId, userId) {
  return useQuery({
    queryKey: ["clientDashboardStats", workspaceId],
    queryFn: async () => {
      const res = await fetch(
        `${baseURL}/api/post/pending-approvals?workspaceId=${workspaceId}&userId=${userId}&status=all`
      );
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      const data = await res.json();
      const responseData = data.data || data;

      // Calculate stats from response
      const stats = {
        pending: responseData.counts?.pending || 0,
        changesRequested: responseData.counts?.changes_requested || 0,
        approved: responseData.counts?.approved || 0,
        rejected: responseData.counts?.rejected || 0
      };

      // Get recent posts for activity
      const allPosts = [
        ...(responseData.grouped?.pending || []),
        ...(responseData.grouped?.changes_requested || []),
        ...(responseData.grouped?.approved || []),
        ...(responseData.grouped?.rejected || [])
      ];

      // Sort by date and take last 5
      const recentActivity = allPosts
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 5);

      return { stats, recentActivity };
    },
    enabled: !!(workspaceId && userId),
    staleTime: 1000 * 30, // 30 seconds - client needs fresh approval data
  });
}

// Client Approved/Rejected Posts History
export function useClientApprovedPosts(workspaceId, userId) {
  return useQuery({
    queryKey: ["clientApprovedPosts", workspaceId],
    queryFn: async () => {
      const res = await fetch(
        `${baseURL}/api/post/pending-approvals?workspaceId=${workspaceId}&userId=${userId}&status=all`
      );
      if (!res.ok) throw new Error("Failed to fetch post history");
      const data = await res.json();
      const responseData = data.data || data;
      const approvedPosts = responseData.grouped?.approved || [];
      const rejectedPosts = responseData.grouped?.rejected || [];
      return [...approvedPosts, ...rejectedPosts];
    },
    enabled: !!(workspaceId && userId),
    staleTime: 1000 * 60, // 1 minute - historical data doesn't change often
  });
}

// Client Calendar Posts - all posts for calendar view
export function useClientCalendarPosts(workspaceId, userId) {
  return useQuery({
    queryKey: ["clientCalendarPosts", workspaceId],
    queryFn: async () => {
      const res = await fetch(
        `${baseURL}/api/post/pending-approvals?workspaceId=${workspaceId}&userId=${userId}&status=all`
      );
      if (!res.ok) throw new Error("Failed to fetch calendar posts");
      const data = await res.json();
      const responseData = data.data || data;
      return [
        ...(responseData.grouped?.pending || []),
        ...(responseData.grouped?.changes_requested || []),
        ...(responseData.grouped?.approved || []),
        ...(responseData.grouped?.rejected || [])
      ];
    },
    enabled: !!(workspaceId && userId),
    staleTime: 1000 * 30, // 30 seconds
  });
}

// ============================================
// DASHBOARD STATS (Post History)
// ============================================

export function useDashboardStats(workspaceId, userId) {
  return useQuery({
    queryKey: ["dashboardStats", workspaceId],
    queryFn: async () => {
      const queryParam = workspaceId
        ? `workspaceId=${workspaceId}`
        : `userId=${userId}`;
      const res = await fetch(`${baseURL}/api/post-history?${queryParam}`);
      if (!res.ok) throw new Error("Failed to fetch post history");
      const data = await res.json();
      const posts = data.data?.history || data.history || [];

      // Calculate stats
      const now = new Date();
      const thisMonthPosts = posts.filter(post => {
        const postDate = new Date(post.created || post.scheduleDate);
        return postDate.getMonth() === now.getMonth() &&
               postDate.getFullYear() === now.getFullYear();
      });

      return {
        recentPosts: posts.slice(0, 5),
        totalPosts: posts.length,
        postsThisMonth: thisMonthPosts.length
      };
    },
    enabled: !!(workspaceId || userId),
    staleTime: 1000 * 60 * 2, // 2 minutes - stats don't change rapidly
  });
}

// ============================================
// MEDIA / ASSETS
// ============================================

export function useRecentMedia(workspaceId, userId) {
  return useQuery({
    queryKey: ["recentMedia", workspaceId],
    queryFn: async () => {
      const res = await fetch(
        `${baseURL}/api/media/recent?workspaceId=${workspaceId}&userId=${userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch recent media");
      const data = await res.json();
      return data.data?.media || [];
    },
    enabled: !!(workspaceId && userId),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useAssetLibrary(workspaceId, userId, filters = {}) {
  const { type, search, limit = 50, offset = 0 } = filters;

  return useQuery({
    queryKey: ["assetLibrary", workspaceId, type, search, limit, offset],
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceId, userId });
      if (type) params.append("type", type);
      if (search) params.append("search", search);
      if (limit) params.append("limit", String(limit));
      if (offset) params.append("offset", String(offset));

      const res = await fetch(`${baseURL}/api/media/assets?${params}`);
      if (!res.ok) throw new Error("Failed to fetch asset library");
      const data = await res.json();
      return data.data || { assets: [], total: 0 };
    },
    enabled: !!(workspaceId && userId),
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function useAssetUsage(workspaceId) {
  return useQuery({
    queryKey: ["assetUsage", workspaceId],
    queryFn: async () => {
      const res = await fetch(`${baseURL}/api/media/assets/usage?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch asset usage");
      const data = await res.json();
      return data.data || { used: 0, limit: 0, assetCount: 0 };
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60, // 1 minute
  });
}

// ============================================
// CACHE INVALIDATION HELPERS
// ============================================

export function useInvalidateQueries() {
  const queryClient = useQueryClient();

  return {
    // Invalidate after creating/updating a post
    invalidatePosts: (workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["posts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["scheduledPosts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["pendingApprovals", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["drafts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["unifiedSchedule", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats", workspaceId] });
      // Also invalidate client portal caches
      queryClient.invalidateQueries({ queryKey: ["clientDashboardStats", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["clientApprovedPosts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["clientCalendarPosts", workspaceId] });
    },

    // Invalidate after connecting/disconnecting accounts
    invalidateAccounts: (workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["connectedAccounts", workspaceId] });
    },

    // Invalidate after team member changes
    invalidateTeam: (workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["pendingInvites", workspaceId] });
    },

    // Invalidate agency team roster (covers both old and new query keys)
    invalidateAgencyTeam: (userId) => {
      queryClient.invalidateQueries({ queryKey: ["agencyTeam", userId] });
      queryClient.invalidateQueries({ queryKey: ["agencyAccess", userId] });
    },

    // Invalidate notifications
    invalidateNotifications: (userId) => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },

    // Invalidate media caches
    invalidateRecentMedia: (workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["recentMedia", workspaceId] });
    },

    invalidateAssetLibrary: (workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["assetLibrary", workspaceId] });
    },

    invalidateAssetUsage: (workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["assetUsage", workspaceId] });
    },

    // Invalidate everything for a workspace
    invalidateAll: (workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["posts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["scheduledPosts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["pendingApprovals", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["drafts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["unifiedSchedule", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["connectedAccounts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["brandProfile", workspaceId] });
      // Client portal caches
      queryClient.invalidateQueries({ queryKey: ["clientDashboardStats", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["clientApprovedPosts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["clientCalendarPosts", workspaceId] });
      // Media caches
      queryClient.invalidateQueries({ queryKey: ["recentMedia", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["assetLibrary", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["assetUsage", workspaceId] });
    },
  };
}
