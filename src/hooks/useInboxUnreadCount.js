import { useQuery } from '@tanstack/react-query';
import { baseURL } from '../utils/constants';

/**
 * Custom hook to fetch unread message count for the sidebar badge.
 * Uses React Query so that when the inbox page (useInbox) fetches the same
 * endpoint with the same query key, React Query deduplicates the request
 * instead of hitting the server twice.
 *
 * @param {string} workspaceId - Current workspace ID
 * @param {boolean} enabled - Whether to enable polling (default: true)
 */
export function useInboxUnreadCount(workspaceId, enabled = true) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inboxConversations', workspaceId, 'all'],
    queryFn: async () => {
      const params = new URLSearchParams({
        workspaceId,
        platform: 'all',
        refresh: 'false'
      });

      const response = await fetch(`${baseURL}/api/inbox/conversations?${params}`);
      const raw = await response.json();
      if (!response.ok) throw new Error(raw.error || 'Failed to fetch inbox');
      return raw.data || raw;
    },
    enabled: !!workspaceId && enabled,
    staleTime: 1000 * 30, // 30 seconds — matches useInbox polling rate
    refetchInterval: 1000 * 60, // Poll every 60 seconds for sidebar badge
  });

  return {
    unreadCount: data?.totalUnread || 0,
    loading: isLoading,
    refresh: refetch
  };
}

export default useInboxUnreadCount;
