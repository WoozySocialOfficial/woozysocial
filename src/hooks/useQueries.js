import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { baseURL } from "../utils/constants";

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
    staleTime: 1000 * 60 * 5, // 5 minutes - accounts don't change often
  });
}

// ============================================
// POSTS
// ============================================

export function usePosts(workspaceId, userId, options = {}) {
  const { status, limit = 50 } = options;

  return useQuery({
    queryKey: ["posts", workspaceId, status, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workspaceId) params.append("workspaceId", workspaceId);
      if (userId) params.append("userId", userId);
      if (status) params.append("status", status);
      if (limit) params.append("limit", limit);

      const res = await fetch(`${baseURL}/api/posts?${params}`);
      if (!res.ok) throw new Error("Failed to fetch posts");
      const data = await res.json();
      return data.data || data;
    },
    enabled: !!(workspaceId || userId),
    staleTime: 1000 * 30, // 30 seconds - posts change more frequently
  });
}

export function useScheduledPosts(workspaceId, userId) {
  return useQuery({
    queryKey: ["scheduledPosts", workspaceId],
    queryFn: async () => {
      const queryParam = workspaceId
        ? `workspaceId=${workspaceId}`
        : `userId=${userId}`;
      const res = await fetch(`${baseURL}/api/posts/scheduled?${queryParam}`);
      if (!res.ok) throw new Error("Failed to fetch scheduled posts");
      const data = await res.json();
      return data.data || data;
    },
    enabled: !!(workspaceId || userId),
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

// ============================================
// DRAFTS
// ============================================

export function useDrafts(workspaceId, userId) {
  return useQuery({
    queryKey: ["drafts", workspaceId],
    queryFn: async () => {
      const queryParam = workspaceId
        ? `workspaceId=${workspaceId}`
        : `userId=${userId}`;
      const res = await fetch(`${baseURL}/api/drafts?${queryParam}`);
      if (!res.ok) throw new Error("Failed to fetch drafts");
      const data = await res.json();
      return data.data || data;
    },
    enabled: !!(workspaceId || userId),
    staleTime: 1000 * 60, // 1 minute
  });
}

// ============================================
// TEAM MEMBERS
// ============================================

export function useTeamMembers(workspaceId) {
  return useQuery({
    queryKey: ["teamMembers", workspaceId],
    queryFn: async () => {
      const res = await fetch(`${baseURL}/api/workspace/members?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch team members");
      const data = await res.json();
      return data.data || data;
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 2, // 2 minutes
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
      const res = await fetch(`${baseURL}/api/brand-profile?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch brand profile");
      const data = await res.json();
      return data.data || data;
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes - brand profile rarely changes
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
    },

    // Invalidate after connecting/disconnecting accounts
    invalidateAccounts: (workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["connectedAccounts", workspaceId] });
    },

    // Invalidate after team member changes
    invalidateTeam: (workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId] });
    },

    // Invalidate notifications
    invalidateNotifications: (userId) => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },

    // Invalidate everything for a workspace
    invalidateAll: (workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["posts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["scheduledPosts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["pendingApprovals", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["drafts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["connectedAccounts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["teamMembers", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["brandProfile", workspaceId] });
    },
  };
}
