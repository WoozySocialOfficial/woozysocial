import { useState, useEffect, useRef } from 'react';
import { baseURL } from '../utils/constants';

const POLL_INTERVAL = 60000; // Check every 60 seconds

/**
 * Custom hook to fetch unread message count for the sidebar badge
 * @param {string} workspaceId - Current workspace ID
 * @param {boolean} enabled - Whether to enable polling (default: true)
 */
export function useInboxUnreadCount(workspaceId, enabled = true) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const pollIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  const fetchUnreadCount = async () => {
    if (!workspaceId || !enabled) return;

    setLoading(true);

    try {
      const params = new URLSearchParams({
        workspaceId,
        platform: 'all',
        refresh: 'false' // Use cached data for sidebar
      });

      const response = await fetch(`${baseURL}/api/inbox/conversations?${params}`);
      const data = await response.json();

      if (response.ok && data.success !== false && isMountedRef.current) {
        setUnreadCount(data.totalUnread || 0);
      }
    } catch (err) {
      // Silently fail - don't show errors in sidebar
      console.error('[useInboxUnreadCount] Error:', err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    if (workspaceId && enabled) {
      // Initial fetch
      fetchUnreadCount();

      // Setup polling
      pollIntervalRef.current = setInterval(() => {
        fetchUnreadCount();
      }, POLL_INTERVAL);
    }

    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [workspaceId, enabled]);

  return {
    unreadCount,
    loading,
    refresh: fetchUnreadCount
  };
}

export default useInboxUnreadCount;
