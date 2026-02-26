import { useState } from 'react';
import { useRecentMedia, useInvalidateQueries } from '../../hooks/useQueries';
import { baseURL } from '../../utils/constants';
import './RecentMediaGrid.css';

export const RecentMediaGrid = ({ workspaceId, userId, onSelect, maxSelectable = 10 }) => {
  const { data: media = [], isLoading, error } = useRecentMedia(workspaceId, userId);
  const { invalidateAssetLibrary } = useInvalidateQueries();
  const [selected, setSelected] = useState(new Set());
  const [savingUrls, setSavingUrls] = useState(new Set());
  const [savedUrls, setSavedUrls] = useState(new Set());

  const toggleSelect = (url) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else if (next.size < maxSelectable) {
        next.add(url);
      }
      return next;
    });
  };

  const handleAddSelected = () => {
    const selectedItems = media
      .filter(item => selected.has(item.url))
      .map(item => ({
        url: item.url,
        type: item.type,
        name: item.url.split('/').pop() || 'media'
      }));
    onSelect(selectedItems);
    setSelected(new Set());
  };

  const handleSaveToLibrary = async (e, item) => {
    e.stopPropagation(); // Don't toggle selection
    if (savingUrls.has(item.url) || savedUrls.has(item.url)) return;

    setSavingUrls(prev => new Set(prev).add(item.url));

    try {
      const res = await fetch(`${baseURL}/api/media/assets/save-from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: item.url,
          workspaceId,
          userId,
          fileName: item.url.split('/').pop() || 'media'
        })
      });

      if (res.ok) {
        setSavedUrls(prev => new Set(prev).add(item.url));
        invalidateAssetLibrary(workspaceId);
      }
    } catch (err) {
      console.error('Failed to save to library:', err);
    } finally {
      setSavingUrls(prev => {
        const next = new Set(prev);
        next.delete(item.url);
        return next;
      });
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="recent-media-grid">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="recent-media-skeleton" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="recent-media-empty">
        <p>Failed to load recent media</p>
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="recent-media-empty">
        <div className="recent-media-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M4 16L8.586 11.414C9.367 10.633 10.633 10.633 11.414 11.414L16 16M14 14L15.586 12.414C16.367 11.633 17.633 11.633 18.414 12.414L20 14M14 8H14.01M6 20H18C19.105 20 20 19.105 20 18V6C20 4.895 19.105 4 18 4H6C4.895 4 4 4.895 4 6V18C4 19.105 4.895 20 6 20Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="recent-media-empty-text">No recent media</p>
        <p className="recent-media-empty-sub">Media from your last 5 days of posts will appear here</p>
      </div>
    );
  }

  return (
    <div className="recent-media-container">
      <div className="recent-media-grid">
        {media.map((item) => {
          const isSelected = selected.has(item.url);
          const isSaving = savingUrls.has(item.url);
          const isSaved = savedUrls.has(item.url);
          return (
            <div
              key={item.url}
              className={`recent-media-item ${isSelected ? 'selected' : ''}`}
              onClick={() => toggleSelect(item.url)}
            >
              <div className="recent-media-thumb">
                {item.type === 'video' ? (
                  <video src={item.url} muted />
                ) : (
                  <img src={item.url} alt="Recent media" loading="lazy" />
                )}
                {item.type === 'video' && (
                  <span className="recent-media-type-badge">Video</span>
                )}
                {/* Save to Library button */}
                <button
                  className={`save-to-library-btn ${isSaved ? 'saved' : ''}`}
                  onClick={(e) => handleSaveToLibrary(e, item)}
                  disabled={isSaving || isSaved}
                  title={isSaved ? 'Saved to library' : 'Save to library'}
                >
                  {isSaving ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="spin">
                      <path d="M12 2V6M12 18V22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12H6M18 12H22M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  ) : isSaved ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H14L21 10V19C21 20.1046 20.1046 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M17 21V13H7V21M7 3V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              </div>
              {isSelected && (
                <div className="recent-media-check">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="9" fill="#7c3aed" stroke="white" strokeWidth="2"/>
                    <path d="M6 10L9 13L14 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
              <div className="recent-media-date">{formatDate(item.usedAt)}</div>
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div className="recent-media-actions">
          <span className="recent-media-count">{selected.size} selected</span>
          <button className="recent-media-add-btn" onClick={handleAddSelected}>
            Add {selected.size} {selected.size === 1 ? 'File' : 'Files'}
          </button>
        </div>
      )}
    </div>
  );
};

export default RecentMediaGrid;
