import { useState, useEffect, useRef, useMemo } from "react";
import { useToast } from "@chakra-ui/react";
import { FiGrid, FiList, FiCheck, FiTrash2, FiX } from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { supabase } from "../utils/supabaseClient";
import { useAssetUsage, useInvalidateQueries } from "../hooks/useQueries";
import { StorageUsageBar } from "./assets/StorageUsageBar";
import { AssetDetailsPanel } from "./assets/AssetDetailsPanel";
import { baseURL } from "../utils/constants";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import "./AssetsContent.css";

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
  { value: 'size_desc', label: 'Largest first' },
  { value: 'size_asc', label: 'Smallest first' },
];

export const AssetsContent = () => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const toast = useToast();
  const fileInputRef = useRef(null);
  const { invalidateAssetUsage, invalidateAssetLibrary } = useInvalidateQueries();

  const { data: usageData } = useAssetUsage(activeWorkspace?.id);

  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, asset: null, isBulk: false });

  // Phase 4 state
  const [viewMode, setViewMode] = useState("grid");
  const [sortBy, setSortBy] = useState("date_desc");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [detailAsset, setDetailAsset] = useState(null);
  const [activeTagFilter, setActiveTagFilter] = useState(null);

  // Collect all unique tags across assets
  const allTags = useMemo(() => {
    const tagSet = new Set();
    assets.forEach(a => {
      if (a.tags && Array.isArray(a.tags)) {
        a.tags.forEach(t => tagSet.add(t));
      }
    });
    return Array.from(tagSet).sort();
  }, [assets]);

  // Fetch assets on mount
  useEffect(() => {
    fetchAssets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeWorkspace]);

  // Exit bulk mode when no items selected
  useEffect(() => {
    if (bulkMode && selectedIds.size === 0) {
      // keep bulk mode active so user can continue selecting
    }
  }, [selectedIds, bulkMode]);

  const fetchAssets = async () => {
    if (!user || !activeWorkspace) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('media_assets')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssets(data || []);
    } catch (error) {
      console.error("Error fetching assets:", error);
      toast({
        title: "Error loading assets",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
      await uploadFiles(files);
    }
  };

  const uploadFiles = async (files) => {
    if (!user) return;

    // Check storage cap before uploading
    if (usageData) {
      const totalNewSize = files.reduce((sum, f) => sum + f.size, 0);
      if (usageData.limit > 0 && usageData.used + totalNewSize > usageData.limit) {
        toast({
          title: "Storage limit exceeded",
          description: "Delete unused assets or upgrade your plan to upload more.",
          status: "error",
          duration: 5000,
          isClosable: true
        });
        return;
      }
    }

    setIsUploading(true);

    for (const file of files) {
      try {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
          toast({
            title: "Invalid file type",
            description: `${file.name} is not an image or video`,
            status: "error",
            duration: 3000,
            isClosable: true
          });
          continue;
        }

        if (file.size > 50 * 1024 * 1024) {
          toast({
            title: "File too large",
            description: `${file.name} exceeds 50MB limit`,
            status: "error",
            duration: 3000,
            isClosable: true
          });
          continue;
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('media-assets')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('media-assets')
          .getPublicUrl(fileName);

        const { error: dbError } = await supabase
          .from('media_assets')
          .insert([{
            workspace_id: activeWorkspace.id,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            storage_path: fileName,
            public_url: publicUrl,
            uploaded_by: user.id
          }]);

        if (dbError) throw dbError;

        toast({
          title: "Upload successful",
          description: `${file.name} uploaded`,
          status: "success",
          duration: 2000,
          isClosable: true
        });
      } catch (error) {
        console.error("Error uploading file:", error);
        toast({
          title: "Upload failed",
          description: `Failed to upload ${file.name}`,
          status: "error",
          duration: 3000,
          isClosable: true
        });
      }
    }

    setIsUploading(false);
    fetchAssets();
    invalidateAssetUsage();
    invalidateAssetLibrary();

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteClick = (asset) => {
    setDeleteConfirm({ isOpen: true, asset, isBulk: false });
  };

  const handleBulkDeleteClick = () => {
    if (selectedIds.size === 0) return;
    setDeleteConfirm({ isOpen: true, asset: null, isBulk: true });
  };

  const handleDelete = async () => {
    if (deleteConfirm.isBulk) {
      // Bulk delete via API
      try {
        const idsArray = Array.from(selectedIds);
        const res = await fetch(
          `${baseURL}/api/media/assets?workspaceId=${activeWorkspace.id}&assetIds=${idsArray.join(',')}`,
          { method: 'DELETE' }
        );
        const data = await res.json();
        if (data.success) {
          toast({
            title: `${data.data.count} asset(s) deleted`,
            status: "success",
            duration: 2000,
            isClosable: true
          });
          setSelectedIds(new Set());
          setBulkMode(false);
          fetchAssets();
          invalidateAssetUsage();
          invalidateAssetLibrary();
        } else {
          throw new Error(data.error || 'Delete failed');
        }
      } catch (error) {
        toast({
          title: "Bulk delete failed",
          description: error.message,
          status: "error",
          duration: 3000,
          isClosable: true
        });
      }
      return;
    }

    const asset = deleteConfirm.asset;
    if (!asset) return;

    try {
      const { error: storageError } = await supabase.storage
        .from('media-assets')
        .remove([asset.storage_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('media_assets')
        .delete()
        .eq('id', asset.id);

      if (dbError) throw dbError;

      toast({
        title: "Asset deleted",
        status: "success",
        duration: 2000,
        isClosable: true
      });

      // If detail panel was showing this asset, close it
      if (detailAsset?.id === asset.id) {
        setDetailAsset(null);
      }

      fetchAssets();
      invalidateAssetUsage();
      invalidateAssetLibrary();
    } catch (error) {
      console.error("Error deleting asset:", error);
      toast({
        title: "Delete failed",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    }
  };

  const handleCopyUrl = (e, url) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    toast({
      title: "URL copied",
      status: "success",
      duration: 2000,
      isClosable: true
    });
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await uploadFiles(files);
    }
  };

  // Bulk selection
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(sortedAssets.map(a => a.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Item click handler
  const handleItemClick = (asset) => {
    if (bulkMode) {
      toggleSelect(asset.id);
    } else {
      setDetailAsset(asset);
    }
  };

  // Handle asset update from detail panel
  const handleAssetUpdate = (updatedAsset) => {
    setAssets(prev => prev.map(a => a.id === updatedAsset.id ? updatedAsset : a));
    setDetailAsset(updatedAsset);
  };

  // Filter + sort
  const sortedAssets = useMemo(() => {
    let result = assets.filter(asset => {
      const matchesFilter = filter === "all" ||
        (filter === "images" && asset.file_type?.startsWith('image/')) ||
        (filter === "videos" && asset.file_type?.startsWith('video/'));

      const matchesSearch = searchQuery === "" ||
        asset.file_name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesTag = !activeTagFilter ||
        (asset.tags && asset.tags.includes(activeTagFilter));

      return matchesFilter && matchesSearch && matchesTag;
    });

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc':
          return new Date(a.created_at) - new Date(b.created_at);
        case 'name_asc':
          return (a.file_name || '').localeCompare(b.file_name || '');
        case 'name_desc':
          return (b.file_name || '').localeCompare(a.file_name || '');
        case 'size_desc':
          return (b.file_size || 0) - (a.file_size || 0);
        case 'size_asc':
          return (a.file_size || 0) - (b.file_size || 0);
        case 'date_desc':
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });

    return result;
  }, [assets, filter, searchQuery, sortBy, activeTagFilter]);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
  };

  const deleteMessage = deleteConfirm.isBulk
    ? `Are you sure you want to delete ${selectedIds.size} selected asset(s)?`
    : `Are you sure you want to delete "${deleteConfirm.asset?.file_name}"?`;

  return (
    <div className="assets-container">
      <div className="assets-header">
        <div className="assets-header-top">
          <div>
            <h1 className="assets-title">Assets</h1>
            <p className="assets-subtitle">Store and organize media for your campaigns</p>
          </div>
          {usageData && usageData.limit > 0 && (
            <div className="assets-storage-bar">
              <StorageUsageBar used={usageData.used} limit={usageData.limit} />
            </div>
          )}
        </div>
      </div>

      <div className="media-library-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Media Library</h2>
            <p className="section-subtitle">Upload and manage your creative assets</p>
          </div>
          <div className="action-buttons">
            <button
              className="upload-button"
              onClick={handleUploadClick}
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload Media'}
            </button>
            <button className="refresh-button" onClick={fetchAssets}>
              Refresh
            </button>
          </div>
        </div>

        {/* Controls Row: filters, search, view toggle, sort */}
        <div className="controls-section">
          <div className="controls-left">
            <div className="filter-buttons">
              <button
                className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({assets.length})
              </button>
              <button
                className={`filter-btn ${filter === 'images' ? 'active' : ''}`}
                onClick={() => setFilter('images')}
              >
                Images ({assets.filter(a => a.file_type?.startsWith('image/')).length})
              </button>
              <button
                className={`filter-btn ${filter === 'videos' ? 'active' : ''}`}
                onClick={() => setFilter('videos')}
              >
                Videos ({assets.filter(a => a.file_type?.startsWith('video/')).length})
              </button>
            </div>
            <input
              type="text"
              className="search-input"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="controls-right">
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="view-toggle">
              <button
                className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <FiGrid size={16} />
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <FiList size={16} />
              </button>
            </div>
            <button
              className={`bulk-toggle-btn ${bulkMode ? 'active' : ''}`}
              onClick={() => {
                setBulkMode(!bulkMode);
                setSelectedIds(new Set());
              }}
            >
              {bulkMode ? <><FiX size={14} /> Cancel</> : <><FiCheck size={14} /> Select</>}
            </button>
          </div>
        </div>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="tag-filter-chips">
            {activeTagFilter && (
              <button
                className="tag-chip clear-tag"
                onClick={() => setActiveTagFilter(null)}
              >
                Clear filter <FiX size={12} />
              </button>
            )}
            {allTags.map(tag => (
              <button
                key={tag}
                className={`tag-chip ${activeTagFilter === tag ? 'active' : ''}`}
                onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Bulk actions bar */}
        {bulkMode && (
          <div className="bulk-actions-bar">
            <span className="bulk-count">{selectedIds.size} selected</span>
            <div className="bulk-btns">
              <button className="bulk-select-all" onClick={selectedIds.size === sortedAssets.length ? deselectAll : selectAll}>
                {selectedIds.size === sortedAssets.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                className="bulk-delete-btn"
                onClick={handleBulkDeleteClick}
                disabled={selectedIds.size === 0}
              >
                <FiTrash2 size={14} /> Delete Selected
              </button>
            </div>
          </div>
        )}

        {/* Drop Zone */}
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleUploadClick}
        >
          <div className="drop-zone-content">
            <div className="upload-icon">📁</div>
            <p className="drop-text">Drag and drop files here or click to browse</p>
            <p className="drop-subtext">Supports images and videos up to 50MB</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Media Grid/List */}
        <div className="media-content">
          {isLoading ? (
            <div className="empty-state">
              <p className="empty-text">Loading assets...</p>
            </div>
          ) : sortedAssets.length === 0 ? (
            <div className="empty-state">
              <div className="cloud-icon">☁️</div>
              <p className="empty-text">
                {searchQuery || activeTagFilter ? 'No assets match your filters' : 'No assets yet. Upload your first file!'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="media-grid">
              {sortedAssets.map((asset) => (
                <div
                  key={asset.id}
                  className={`media-item ${bulkMode && selectedIds.has(asset.id) ? 'selected' : ''}`}
                  onClick={() => handleItemClick(asset)}
                >
                  {bulkMode && (
                    <div className={`bulk-checkbox ${selectedIds.has(asset.id) ? 'checked' : ''}`}>
                      {selectedIds.has(asset.id) && <FiCheck size={12} />}
                    </div>
                  )}
                  <div className="media-preview">
                    {asset.file_type?.startsWith('image/') ? (
                      <img src={asset.public_url} alt={asset.file_name} loading="lazy" />
                    ) : (
                      <video src={asset.public_url} />
                    )}
                  </div>
                  <div className="media-info">
                    <p className="media-name" title={asset.file_name}>
                      {asset.file_name}
                    </p>
                    <p className="media-size">{formatFileSize(asset.file_size)}</p>
                    {asset.tags && asset.tags.length > 0 && (
                      <div className="media-item-tags">
                        {asset.tags.slice(0, 3).map(t => (
                          <span key={t} className="media-item-tag">{t}</span>
                        ))}
                        {asset.tags.length > 3 && (
                          <span className="media-item-tag more">+{asset.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {!bulkMode && (
                    <div className="media-actions">
                      <button
                        className="action-btn copy-btn"
                        onClick={(e) => handleCopyUrl(e, asset.public_url)}
                        title="Copy URL"
                      >
                        🔗
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(asset); }}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* List View */
            <div className="media-list">
              {sortedAssets.map((asset) => (
                <div
                  key={asset.id}
                  className={`media-list-item ${bulkMode && selectedIds.has(asset.id) ? 'selected' : ''}`}
                  onClick={() => handleItemClick(asset)}
                >
                  {bulkMode && (
                    <div className={`bulk-checkbox ${selectedIds.has(asset.id) ? 'checked' : ''}`}>
                      {selectedIds.has(asset.id) && <FiCheck size={12} />}
                    </div>
                  )}
                  <div className="media-list-thumb">
                    {asset.file_type?.startsWith('image/') ? (
                      <img src={asset.public_url} alt={asset.file_name} loading="lazy" />
                    ) : (
                      <video src={asset.public_url} />
                    )}
                  </div>
                  <div className="media-list-info">
                    <p className="media-list-name">{asset.file_name}</p>
                    {asset.tags && asset.tags.length > 0 && (
                      <div className="media-item-tags">
                        {asset.tags.slice(0, 3).map(t => (
                          <span key={t} className="media-item-tag">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="media-list-type">{asset.file_type?.startsWith('image/') ? 'Image' : 'Video'}</p>
                  <p className="media-list-size">{formatFileSize(asset.file_size)}</p>
                  <p className="media-list-date">
                    {new Date(asset.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                  {!bulkMode && (
                    <div className="media-list-actions">
                      <button
                        className="action-btn copy-btn"
                        onClick={(e) => handleCopyUrl(e, asset.public_url)}
                        title="Copy URL"
                      >
                        🔗
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(asset); }}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Asset Details Panel */}
      {detailAsset && (
        <AssetDetailsPanel
          asset={detailAsset}
          onClose={() => setDetailAsset(null)}
          onDelete={(asset) => {
            setDetailAsset(null);
            handleDeleteClick(asset);
          }}
          onUpdate={handleAssetUpdate}
          workspaceId={activeWorkspace?.id}
          allTags={allTags}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, asset: null, isBulk: false })}
        onConfirm={handleDelete}
        title={deleteConfirm.isBulk ? "Delete Selected Assets" : "Delete Asset"}
        message={deleteMessage}
        confirmText="Delete"
        confirmVariant="danger"
      />
    </div>
  );
};
