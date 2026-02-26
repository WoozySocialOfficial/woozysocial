import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { baseURL } from '../../utils/constants';
import { supabase } from '../../utils/supabaseClient';
import { formatRelativeTime } from '../../utils/timezones';
import './CommentThread.css';

const PRIORITY_CONFIG = {
  urgent: { color: '#ef4444', label: 'Urgent', icon: '🔴' },
  high: { color: '#f59e0b', label: 'High', icon: '🟠' },
  normal: { color: '#6b7280', label: 'Normal', icon: '⚪' }
};

const getSystemActionBadge = (commentText) => {
  if (!commentText) return null;
  const lower = commentText.toLowerCase();
  if (lower.includes('post approved')) return { color: '#10b981', label: 'Approved', icon: '✅' };
  if (lower.includes('post rejected')) return { color: '#ef4444', label: 'Rejected', icon: '❌' };
  if (lower.includes('marked for changes') || lower.includes('change request')) return { color: '#f59e0b', label: 'Changes Requested', icon: '📝' };
  if (lower.includes('changes have been addressed') || lower.includes('ready for re-approval')) return { color: '#6366f1', label: 'Resubmitted', icon: '🔄' };
  return null;
};

export const CommentThread = ({
  postId,
  draftId,
  workspaceId,
  onCommentAdded,
  enableRealtime = true
}) => {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [memberNames, setMemberNames] = useState([]);

  // Fetch workspace member names for mention highlighting via API
  useEffect(() => {
    const fetchMembers = async () => {
      if (!workspaceId || !user?.id) return;
      try {
        const res = await fetch(
          `${baseURL}/api/workspaces/${workspaceId}/members?userId=${user.id}`
        );
        const data = await res.json();

        if (data.success) {
          const responseData = data.data || data;
          const names = (responseData.members || [])
            .map(m => m.profile?.full_name)
            .filter(Boolean);
          setMemberNames(names);
        }
      } catch (err) {
        console.error('Error fetching member names for mentions:', err);
      }
    };
    fetchMembers();
  }, [workspaceId, user?.id]);

  // Render comment text with highlighted @mentions
  const renderCommentText = (text) => {
    if (!text || memberNames.length === 0) return text;

    // Sort names longest-first so "John Doe" matches before "John"
    const sorted = [...memberNames].sort((a, b) => b.length - a.length);
    const escaped = sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(@(?:${escaped.join('|')}))`, 'gi');

    const parts = text.split(regex);
    if (parts.length === 1) return text;

    return parts.map((part, i) => {
      if (part.startsWith('@') && sorted.some(n => part.slice(1).toLowerCase() === n.toLowerCase())) {
        return <span key={i} className="comment-mention">{part}</span>;
      }
      return part;
    });
  };

  // Fetch comments
  const fetchComments = async () => {
    if ((!postId && !draftId) || !workspaceId) return;

    setLoading(true);
    try {
      // Build query string based on whether it's a post or draft
      const idParam = postId ? `postId=${postId}` : `draftId=${draftId}`;
      const res = await fetch(
        `${baseURL}/api/post/comment?${idParam}&workspaceId=${workspaceId}&userId=${user.id}`
      );
      const data = await res.json();

      if (data.success) {
        const responseData = data.data || data;
        setComments(responseData.comments || []);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, draftId, workspaceId]);

  // Real-time subscription
  useEffect(() => {
    if (!enableRealtime || !postId) return;

    const channel = supabase
      .channel(`comments-${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`
        },
        async (payload) => {
          // Fetch the complete comment with user profile
          const { data } = await supabase
            .from('post_comments')
            .select(`
              id,
              comment,
              priority,
              mentions,
              is_system,
              created_at,
              user_id,
              user_profiles (
                full_name,
                email,
                avatar_url
              )
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setComments(prev => [...prev, data]);
            if (onCommentAdded) onCommentAdded(data);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`
        },
        (payload) => {
          setComments(prev =>
            prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`
        },
        (payload) => {
          setComments(prev => prev.filter(c => c.id !== payload.old.id));
        }
      )
      .subscribe();

    // Fallback polling every 30s
    const interval = setInterval(fetchComments, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, enableRealtime]);

  const getPriorityConfig = (priority) => {
    return PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
  };

  if (loading && comments.length === 0) {
    return <div className="loading-comments">Loading comments...</div>;
  }

  if (comments.length === 0) {
    return <div className="no-comments">No comments yet</div>;
  }

  return (
    <div className="comment-thread">
      {comments.map((comment) => {
        const priorityConfig = getPriorityConfig(comment.priority);
        const isOwnComment = comment.user_id === user?.id;
        const systemBadge = comment.is_system ? getSystemActionBadge(comment.comment) : null;

        return (
          <div
            key={comment.id}
            className={`comment ${comment.is_system ? 'system-comment' : ''} ${isOwnComment ? 'own-comment' : ''}`}
            style={{ borderLeft: `3px solid ${systemBadge?.color || priorityConfig.color}` }}
          >
            <div className="comment-header">
              <div className="comment-author-section">
                {comment.user_profiles?.avatar_url ? (
                  <img
                    src={comment.user_profiles.avatar_url}
                    alt=""
                    className="comment-avatar"
                  />
                ) : (
                  <div className="comment-avatar-placeholder">
                    {(comment.user_profiles?.full_name || 'U')[0].toUpperCase()}
                  </div>
                )}
                <span className="comment-author">
                  {comment.user_profiles?.full_name || comment.user_profiles?.email || 'User'}
                </span>
                {comment.priority !== 'normal' && (
                  <span
                    className="priority-badge"
                    style={{ backgroundColor: priorityConfig.color }}
                    title={priorityConfig.label}
                  >
                    {priorityConfig.icon} {priorityConfig.label}
                  </span>
                )}
                {systemBadge && (
                  <span
                    className="priority-badge system-action-badge"
                    style={{ backgroundColor: systemBadge.color }}
                    title={systemBadge.label}
                  >
                    {systemBadge.icon} {systemBadge.label}
                  </span>
                )}
              </div>
              <span className="comment-time">{formatRelativeTime(comment.created_at)}</span>
            </div>
            <p className="comment-text">{renderCommentText(comment.comment)}</p>
            {comment.updated_at && comment.updated_at !== comment.created_at && (
              <span className="comment-edited">(edited)</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
