import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { baseURL } from '../../utils/constants';
import { supabase } from '../../utils/supabaseClient';
import { useToast } from '@chakra-ui/react';
import './CommentInput.css';

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal', icon: '⚪', color: '#6b7280' },
  { value: 'high', label: 'High', icon: '🟠', color: '#f59e0b' },
  { value: 'urgent', label: 'Urgent', icon: '🔴', color: '#ef4444' }
];

export const CommentInput = ({
  postId,
  draftId,
  workspaceId,
  onCommentAdded,
  placeholder = "Add a comment...",
  showPrioritySelector = true
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [priority, setPriority] = useState('normal');
  const [submitting, setSubmitting] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef(null);

  // Fetch workspace members for @mentions
  useEffect(() => {
    const fetchMembers = async () => {
      if (!workspaceId) return;

      const { data, error } = await supabase
        .from('workspace_members')
        .select(`
          user_id,
          user_profiles (
            id,
            full_name,
            email,
            avatar_url
          )
        `)
        .eq('workspace_id', workspaceId);

      if (!error && data) {
        setWorkspaceMembers(
          data.map(m => ({
            id: m.user_profiles.id,
            full_name: m.user_profiles.full_name,
            email: m.user_profiles.email,
            avatar_url: m.user_profiles.avatar_url
          }))
        );
      }
    };

    fetchMembers();
  }, [workspaceId]);

  // Handle @mention detection
  const handleTextChange = (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;

    setComment(value);
    setCursorPosition(cursorPos);

    // Detect @ symbol
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbol !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtSymbol + 1);

      // Check if there's a space after @ (means finished mentioning)
      if (!textAfterAt.includes(' ')) {
        setMentionSearch(textAfterAt.toLowerCase());
        setShowMentions(true);

        // Calculate dropdown position
        const textarea = textareaRef.current;
        if (textarea) {
          const coords = getCaretCoordinates(textarea, cursorPos);
          setMentionPosition({
            top: coords.top + 20,
            left: coords.left
          });
        }
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  // Simple caret position calculator
  const getCaretCoordinates = (element, position) => {
    const div = document.createElement('div');
    const style = getComputedStyle(element);

    ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight'].forEach(prop => {
      div.style[prop] = style[prop];
    });

    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.width = `${element.offsetWidth}px`;

    const text = element.value.substring(0, position);
    div.textContent = text;

    document.body.appendChild(div);
    const coordinates = {
      top: div.offsetHeight,
      left: div.offsetWidth % element.offsetWidth
    };
    document.body.removeChild(div);

    return coordinates;
  };

  // Filter members based on search
  const filteredMembers = workspaceMembers.filter(member => {
    if (!mentionSearch) return true;
    return (
      member.full_name?.toLowerCase().includes(mentionSearch) ||
      member.email?.toLowerCase().includes(mentionSearch)
    );
  }).slice(0, 5);

  // Handle mention selection
  const selectMention = (member) => {
    const textBeforeCursor = comment.substring(0, cursorPosition);
    const textAfterCursor = comment.substring(cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    const newText =
      comment.substring(0, lastAtSymbol) +
      `@${member.full_name} ` +
      textAfterCursor;

    setComment(newText);
    setShowMentions(false);
    setMentionSearch('');

    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus();
      const newCursorPos = lastAtSymbol + member.full_name.length + 2;
      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Parse mentions from comment text
  const parseMentions = () => {
    const mentionRegex = /@([A-Za-z]+(?:\s+[A-Za-z]+)*)/g;
    const matches = [...comment.matchAll(mentionRegex)];
    const mentionedIds = [];

    matches.forEach(match => {
      const name = match[1].trim();
      const member = workspaceMembers.find(
        m => m.full_name?.toLowerCase() === name.toLowerCase()
      );
      if (member) mentionedIds.push(member.id);
    });

    return mentionedIds;
  };

  // Submit comment
  const handleSubmit = async () => {
    if (!comment.trim() || submitting) return;

    setSubmitting(true);
    try {
      const mentions = parseMentions();

      const requestBody = {
        workspaceId,
        userId: user.id,
        comment: comment.trim(),
        priority,
        mentions
      };

      // Add either postId or draftId
      if (postId) {
        requestBody.postId = postId;
      } else if (draftId) {
        requestBody.draftId = draftId;
      }

      console.log('Submitting comment:', requestBody);

      const res = await fetch(`${baseURL}/api/post/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await res.json();
      console.log('Comment API response:', data);

      if (data.success) {
        const responseData = data.data || data;
        setComment('');
        setPriority('normal');
        if (onCommentAdded) onCommentAdded(responseData.comment);

        toast({
          title: "Comment added",
          status: "success",
          duration: 2000,
          isClosable: true,
        });
      } else {
        throw new Error(data.error || 'Failed to add comment');
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      toast({
        title: "Failed to add comment",
        description: error.message || "Please try again",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }

    if (showMentions && (e.key === 'Escape' || e.key === 'Backspace')) {
      if (e.key === 'Escape') {
        setShowMentions(false);
      }
    }
  };

  return (
    <div className="comment-input-container">
      <div className="comment-input-wrapper">
        <textarea
          ref={textareaRef}
          value={comment}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          maxLength={2000}
          className="comment-textarea"
        />

        {/* Mention Dropdown */}
        {showMentions && filteredMembers.length > 0 && (
          <div
            className="mention-dropdown"
            style={{
              top: mentionPosition.top,
              left: mentionPosition.left
            }}
          >
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="mention-item"
                onClick={() => selectMention(member)}
              >
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" className="mention-avatar" />
                ) : (
                  <div className="mention-avatar-placeholder">
                    {(member.full_name || member.email)[0].toUpperCase()}
                  </div>
                )}
                <div className="mention-info">
                  <div className="mention-name">{member.full_name}</div>
                  <div className="mention-email">{member.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="comment-input-footer">
        <div className="comment-input-actions">
          <span className="char-count">
            {comment.length} / 2000
          </span>

          {showPrioritySelector && (
            <div className="priority-selector">
              <label>Priority:</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="priority-select"
              >
                {PRIORITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          className="btn-submit-comment"
          onClick={handleSubmit}
          disabled={!comment.trim() || submitting}
        >
          {submitting ? 'Adding...' : 'Add Comment'}
        </button>
      </div>

      <div className="comment-input-hint">
        <span>Type @ to mention someone • Ctrl+Enter to submit</span>
      </div>
    </div>
  );
};
