import { useState, useEffect } from 'react';
import { useAssetLibrary } from '../../hooks/useQueries';
import './AssetLibraryGrid.css';

export const AssetLibraryGrid = ({ workspaceId, userId, onSelect, maxSelectable = 10 }) => {
  const [selected, setSelected] = useState(new Set());
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filters = {
    type: typeFilter !== 'all' ? typeFilter : undefined,
    search: debouncedSearch || undefined
  };

  const { data, isLoading, error } = useAssetLibrary(workspaceId, userId, filters);
  const assets = data?.assets || [];

  const toggleSelect = (publicUrl) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(publicUrl)) {
        next.delete(publicUrl);
      } else if (next.size < maxSelectable) {
        next.add(publicUrl);
      }
      return next;
    });
  };

  const handleAddSelected = () => {
    const selectedItems = assets
      .filter(asset => selected.has(asset.public_url))
      .map(asset => ({
        url: asset.public_url,
        type: asset.file_type.startsWith('video/') ? 'video' : 'image',
        name: asset.file_name,
        size: asset.file_size,
        assetId: asset.id
      }));
    onSelect(selectedItems);
    setSelected(new Set());
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="asset-grid-container">
        <div className="asset-grid-controls">
          <div className="asset-search-skeleton" />
        </div>
        <div className="asset-grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="asset-grid-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="asset-grid-empty">
        <p>Failed to load asset library</p>
      </div>
    );
  }

  return (
    <div className="asset-grid-container">
      {/* Controls */}
      <div className="asset-grid-controls">
        <input
          type="text"
          className="asset-search-input"
          placeholder="Search assets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="asset-type-filters">
          <button
            className={`asset-filter-btn ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            All
          </button>
          <button
            className={`asset-filter-btn ${typeFilter === 'image' ? 'active' : ''}`}
            onClick={() => setTypeFilter('image')}
          >
            Images
          </button>
          <button
            className={`asset-filter-btn ${typeFilter === 'video' ? 'active' : ''}`}
            onClick={() => setTypeFilter('video')}
          >
            Videos
          </button>
        </div>
      </div>

      {/* Grid */}
      {assets.length === 0 ? (
        <div className="asset-grid-empty">
          <div className="asset-grid-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M19 11H5M19 11C20.1046 11 21 11.8954 21 13V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V13C3 11.8954 3.89543 11 5 11M19 11V9C19 7.89543 18.1046 7 17 7M5 11V9C5 7.89543 5.89543 7 7 7M7 7V5C7 3.89543 7.89543 3 9 3H15C16.1046 3 17 3.89543 17 5V7M7 7H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="asset-grid-empty-text">
            {debouncedSearch ? 'No assets match your search' : 'No assets in library'}
          </p>
          <p className="asset-grid-empty-sub">
            {debouncedSearch ? 'Try a different search term' : 'Upload assets from the Assets page or save from Recent Media'}
          </p>
        </div>
      ) : (
        <div className="asset-grid">
          {assets.map((asset) => {
            const isSelected = selected.has(asset.public_url);
            const isVideo = asset.file_type.startsWith('video/');
            return (
              <div
                key={asset.id}
                className={`asset-grid-item ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleSelect(asset.public_url)}
              >
                <div className="asset-grid-thumb">
                  {isVideo ? (
                    <video src={asset.public_url} muted />
                  ) : (
                    <img src={asset.public_url} alt={asset.file_name} loading="lazy" />
                  )}
                  {isVideo && <span className="asset-type-badge">Video</span>}
                </div>
                {isSelected && (
                  <div className="asset-grid-check">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="9" fill="#7c3aed" stroke="white" strokeWidth="2"/>
                      <path d="M6 10L9 13L14 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
                <div className="asset-grid-info">
                  <span className="asset-grid-name" title={asset.file_name}>
                    {asset.file_name.length > 18
                      ? asset.file_name.substring(0, 15) + '...'
                      : asset.file_name}
                  </span>
                  <span className="asset-grid-size">{formatFileSize(asset.file_size)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions bar */}
      {selected.size > 0 && (
        <div className="asset-grid-actions">
          <span className="asset-grid-count">{selected.size} selected</span>
          <button className="asset-grid-add-btn" onClick={handleAddSelected}>
            Add {selected.size} {selected.size === 1 ? 'File' : 'Files'}
          </button>
        </div>
      )}
    </div>
  );
};

export default AssetLibraryGrid;
