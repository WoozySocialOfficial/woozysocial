import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [platformStats, setPlatformStats] = useState({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState('all');

  // Refs for polling
  const pollIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  /**
   * Fetch all conversations
   */
  const fetchConversations = useCallback(async (refresh = false) => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        workspaceId,
        platform: selectedPlatform,
        refresh: refresh.toString()
      });

      const response = await fetch(`${baseURL}/api/inbox/conversations?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch conversations');
      }

      if (isMountedRef.current) {
        setConversations(data.conversations || []);
        setPlatformStats(data.platformStats || {});
        setTotalUnread(data.totalUnread || 0);
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
      if (isMountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [workspaceId, selectedPlatform]);

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
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch messages');
      }

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
  }, [fetchMessages]);

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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

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

  // Initial fetch and polling setup
  useEffect(() => {
    isMountedRef.current = true;

    if (workspaceId) {
      // Initial fetch with refresh to sync from Ayrshare
      fetchConversations(true);

      // Setup polling for real-time updates
      if (enablePolling) {
        pollIntervalRef.current = setInterval(() => {
          fetchConversations(false); // Use cache for polling, refresh periodically
        }, pollInterval);
      }
    }

    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [workspaceId, enablePolling, pollInterval]);

  // Re-fetch when platform filter changes
  useEffect(() => {
    if (workspaceId) {
      fetchConversations(false);
    }
  }, [selectedPlatform, workspaceId]);

  return {
    // State
    conversations,
    currentConversation,
    messages,
    loading,
    messagesLoading,
    sending,
    error,
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
