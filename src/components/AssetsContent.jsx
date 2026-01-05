import React, { useState, useEffect, useRef } from "react";
import { useToast } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { supabase } from "../utils/supabaseClient";
import "./AssetsContent.css";

export const AssetsContent = () => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Fetch assets on mount
  useEffect(() => {
    fetchAssets();
  }, [user]);

  const fetchAssets = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error} = await supabase
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

    setIsUploading(true);

    for (const file of files) {
      try {
        // Validate file type
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

        // Validate file size (max 50MB)
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

        // Upload to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('media-assets')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('media-assets')
          .getPublicUrl(fileName);

        // Save metadata to database
        const { error: dbError } = await supabase
          .from('media_assets')
          .insert([{
            workspace_id: activeWorkspace.id,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            storage_path: fileName,
            public_url: publicUrl
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

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (asset) => {
    if (!confirm(`Delete ${asset.file_name}?`)) return;

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('media-assets')
        .remove([asset.storage_path]);

      if (storageError) throw storageError;

      // Delete from database
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

      fetchAssets();
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

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url);
    toast({
      title: "URL copied",
      description: "Asset URL copied to clipboard",
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

  // Filter assets
  const filteredAssets = assets.filter(asset => {
    const matchesFilter = filter === "all" ||
      (filter === "images" && asset.file_type.startsWith('image/')) ||
      (filter === "videos" && asset.file_type.startsWith('video/'));

    const matchesSearch = searchQuery === "" ||
      asset.file_name.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="assets-container">
      <div className="assets-header">
        <h1 className="assets-title">Assets</h1>
        <p className="assets-subtitle">Store and organize media for your campaigns</p>
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
              {isUploading ? '⏳ Uploading...' : '📤 Upload Media'}
            </button>
            <button className="refresh-button" onClick={fetchAssets}>
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="controls-section">
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
              Images ({assets.filter(a => a.file_type.startsWith('image/')).length})
            </button>
            <button
              className={`filter-btn ${filter === 'videos' ? 'active' : ''}`}
              onClick={() => setFilter('videos')}
            >
              Videos ({assets.filter(a => a.file_type.startsWith('video/')).length})
            </button>
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="🔍 Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

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

        {/* Media Grid */}
        <div className="media-content">
          {isLoading ? (
            <div className="empty-state">
              <p className="empty-text">Loading assets...</p>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="empty-state">
              <div className="cloud-icon">☁️</div>
              <p className="empty-text">
                {searchQuery ? 'No assets match your search' : 'No assets yet. Upload your first file!'}
              </p>
            </div>
          ) : (
            <div className="media-grid">
              {filteredAssets.map((asset) => (
                <div key={asset.id} className="media-item">
                  <div className="media-preview">
                    {asset.file_type.startsWith('image/') ? (
                      <img src={asset.public_url} alt={asset.file_name} />
                    ) : (
                      <video src={asset.public_url} />
                    )}
                  </div>
                  <div className="media-info">
                    <p className="media-name" title={asset.file_name}>
                      {asset.file_name}
                    </p>
                    <p className="media-size">{formatFileSize(asset.file_size)}</p>
                  </div>
                  <div className="media-actions">
                    <button
                      className="action-btn copy-btn"
                      onClick={() => handleCopyUrl(asset.public_url)}
                      title="Copy URL"
                    >
                      🔗
                    </button>
                    <button
                      className="action-btn delete-btn"
                      onClick={() => handleDelete(asset)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
