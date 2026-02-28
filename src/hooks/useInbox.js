import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { baseURL } from '../utils/constants';

const SUPPORTED_PLATFORMS = ['facebook', 'instagram', 'twitter'];
const POLL_INTERVAL = 30000; // 30 seconds

/**
 * Custom hook for managing inbox state and API calls
 *
 * @param {string} workspaceId - Current workspace ID
 * @param {Object} options - Configuration options
 * @param {boolean} options.enablePolling - Enable real-time polling (default: true)
 * @param {number} options.pollInterval - Polling interval in ms (default: 30000)
 */
export function useInbox(workspaceId, options = {}) {
  const {
    enablePolling = true,
    pollInterval = POLL_INTERVAL
  } = options;

  // State
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [syncErrors, setSyncErrors] = useState({});
  const [platformStats, setPlatformStats] = useState({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState('all');

  // Refs
  const isMountedRef = useRef(true);
  const queryClient = useQueryClient();

  // Use React Query for conversation fetching.
  // Query key matches useInboxUnreadCount when selectedPlatform='all',
  // so React Query deduplicates and only one request hits the server.
  const { data: queryData, isLoading: queryLoading, refetch: refetchQuery } = useQuery({
    queryKey: ['inboxConversations', workspaceId, selectedPlatform],
    queryFn: async () => {
      const params = new URLSearchParams({
        workspaceId,
        platform: selectedPlatform,
        refresh: 'false'
      });

      const response = await fetch(`${baseURL}/api/inbox/conversations?${params}`);
      const raw = await response.json();
      if (!response.ok) throw new Error(raw.error || 'Failed to fetch conversations');
      return raw.data || raw;
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 20,
    refetchInterval: enablePolling ? pollInterval : false,
  });

  // Sync React Query data into local state (preserves existing component interface)
  useEffect(() => {
    if (queryData) {
      setConversations(queryData.conversations || []);
      setPlatformStats(queryData.platformStats || {});
      setTotalUnread(queryData.totalUnread || 0);

      if (queryData.syncDiagnostics?.platforms) {
        const errors = {};
        for (const [platform, diag] of Object.entries(queryData.syncDiagnostics.platforms)) {
          if (diag.status === 'error' && diag.error) {
            errors[platform] = diag.error;
          }
        }
        setSyncErrors(errors);
      }
    }
  }, [queryData]);

  // Sync loading state
  useEffect(() => {
    setLoading(queryLoading);
  }, [queryLoading]);

  /**
   * Fetch conversations — wraps React Query refetch + supports force refresh from Ayrshare
   */
  const fetchConversations = useCallback(async (refresh = false) => {
    if (!workspaceId) return;

    if (refresh) {
      // Force refresh bypasses cache and syncs from Ayrshare
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          workspaceId,
          platform: selectedPlatform,
          refresh: 'true'
        });
        const response = await fetch(`${baseURL}/api/inbox/conversations?${params}`);
        const raw = await response.json();
        if (!response.ok) throw new Error(raw.error || 'Failed to fetch conversations');
        const data = raw.data || raw;
        if (isMountedRef.current) {
          setConversations(data.conversations || []);
          setPlatformStats(data.platformStats || {});
          setTotalUnread(data.totalUnread || 0);
          if (data.syncDiagnostics?.platforms) {
            const errors = {};
            for (const [platform, diag] of Object.entries(data.syncDiagnostics.platforms)) {
              if (diag.status === 'error' && diag.error) {
                errors[platform] = diag.error;
              }
            }
            setSyncErrors(errors);
          }
        }
        // Update React Query cache so sidebar picks up new data too
        queryClient.setQueryData(['inboxConversations', workspaceId, selectedPlatform], data);
      } catch (err) {
        console.error('Error fetching conversations:', err);
        if (isMountedRef.current) setError(err.message);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    } else {
      // Non-refresh: let React Query handle it (deduplicates with sidebar)
      refetchQuery();
    }
  }, [workspaceId, selectedPlatform, refetchQuery, queryClient]);

  /**
   * Fetch messages for a specific conversation
   */
  const fetchMessages = useCallback(async (conversationId, platform, refresh = false) => {
    if (!workspaceId || !conversationId || !platform) return;

    setMessagesLoading(true);

    try {
      const params = new URLSearchParams({
        conversationId,
        workspaceId,
        platform,
        refresh: refresh.toString()
      });

      const response = await fetch(`${baseURL}/api/inbox/messages?${params}`);
      const raw = await response.json();

      if (!response.ok) {
        throw new Error(raw.error || 'Failed to fetch messages');
      }

      // API wraps response in { success, data: { ... } }
      const data = raw.data || raw;

      if (isMountedRef.current) {
        setMessages(data.messages || []);
      }

      return data;
    } catch (err) {
      console.error('Error fetching messages:', err);
      if (isMountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (isMountedRef.current) {
        setMessagesLoading(false);
      }
    }
  }, [workspaceId]);

  /**
   * Mark a conversation as read
   */
  const markAsRead = useCallback(async (conversationId, userId) => {
    try {
      const response = await fetch(`${baseURL}/api/inbox/mark-read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          userId: userId || 'current-user' // Will be replaced with actual user ID
        })
      });

      if (response.ok) {
        // Update local state
        setConversations(prev => prev.map(conv =>
          conv.id === conversationId
            ? { ...conv, unread_count: 0 }
            : conv
        ));

        // Update total unread count
        setTotalUnread(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  }, []);

  /**
   * Select a conversation and load its messages
   */
  const selectConversation = useCallback(async (conversation) => {
    setCurrentConversation(conversation);

    if (conversation) {
      await fetchMessages(conversation.id, conversation.platform, true);

      // Mark as read
      if (conversation.unread_count > 0) {
        await markAsRead(conversation.id);
      }
    } else {
      setMessages([]);
    }
  }, [fetchMessages, markAsRead]);

  /**
   * Send a message in the current conversation
   */
  const sendMessage = useCallback(async (messageText, mediaUrl = null) => {
    if (!currentConversation || !messageText.trim()) {
      return { success: false, error: 'No conversation selected or message is empty' };
    }

    setSending(true);

    try {
      const response = await fetch(`${baseURL}/api/inbox/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          platform: currentConversation.platform,
          conversationId: currentConversation.id,
          message: messageText,
          mediaUrl
        })
      });

      const raw = await response.json();

      if (!response.ok) {
        throw new Error(raw.error || 'Failed to send message');
      }

      // API wraps response in { success, data: { ... } }
      const data = raw.data || raw;

      // Add the sent message to the local state
      if (isMountedRef.current && data.message) {
        setMessages(prev => [...prev, data.message]);

        // Update conversation's last message
        setConversations(prev => prev.map(conv =>
          conv.id === currentConversation.id
            ? {
                ...conv,
                last_message_text: messageText,
                last_message_at: new Date().toISOString(),
                last_message_sender: 'user'
              }
            : conv
        ));
      }

      return { success: true, message: data.message };
    } catch (err) {
      console.error('Error sending message:', err);
      return { success: false, error: err.message };
    } finally {
      if (isMountedRef.current) {
        setSending(false);
      }
    }
  }, [workspaceId, currentConversation]);

  /**
   * Refresh conversations from Ayrshare API
   */
  const refresh = useCallback(() => {
    return fetchConversations(true);
  }, [fetchConversations]);

  /**
   * Filter conversations by platform
   */
  const filterByPlatform = useCallback((platform) => {
    setSelectedPlatform(platform);
  }, []);

  // Initial Ayrshare sync on mount + cleanup
  useEffect(() => {
    isMountedRef.current = true;

    if (workspaceId) {
      // One-time refresh to sync from Ayrshare on mount
      fetchConversations(true);
    }

    return () => {
      isMountedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return {
    // State
    conversations,
    currentConversation,
    messages,
    loading,
    messagesLoading,
    sending,
    error,
    syncErrors,
    platformStats,
    totalUnread,
    selectedPlatform,
    supportedPlatforms: SUPPORTED_PLATFORMS,

    // Actions
    fetchConversations,
    fetchMessages,
    selectConversation,
    sendMessage,
    markAsRead,
    refresh,
    filterByPlatform,
    setSelectedPlatform,
    clearError: () => setError(null)
  };
}

export default useInbox;
