import { useState, useRef, useEffect } from 'react';
import { FiX, FiPlus } from 'react-icons/fi';
import './AssetTagEditor.css';

export const AssetTagEditor = ({ tags = [], onChange, allTags = [] }) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);

  // Filter suggestions: tags that exist in workspace but aren't already on this asset
  const suggestions = allTags
    .filter(t => !tags.includes(t))
    .filter(t => t.toLowerCase().includes(inputValue.toLowerCase()))
    .slice(0, 5);

  const handleAdd = (tag) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleRemove = (tag) => {
    onChange(tags.filter(t => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      handleAdd(inputValue);
    }
    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      handleRemove(tags[tags.length - 1]);
    }
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (inputRef.current && !inputRef.current.closest('.tag-editor-input-area')?.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="asset-tag-editor">
      <div className="tag-pills">
        {tags.map(tag => (
          <span key={tag} className="tag-pill">
            {tag}
            <button className="tag-pill-remove" onClick={() => handleRemove(tag)}>
              <FiX size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="tag-editor-input-area">
        <FiPlus size={14} className="tag-input-icon" />
        <input
          ref={inputRef}
          type="text"
          className="tag-editor-input"
          placeholder="Add tag..."
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
        />
        {showSuggestions && inputValue && suggestions.length > 0 && (
          <div className="tag-suggestions">
            {suggestions.map(s => (
              <button key={s} className="tag-suggestion-item" onClick={() => handleAdd(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetTagEditor;
