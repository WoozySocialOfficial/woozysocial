import { useState, useEffect } from 'react';
import { FiX, FiCopy, FiTrash2, FiCheck, FiImage, FiVideo } from 'react-icons/fi';
import { useToast } from '@chakra-ui/react';
import { AssetTagEditor } from './AssetTagEditor';
import { baseURL } from '../../utils/constants';
import './AssetDetailsPanel.css';

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const AssetDetailsPanel = ({ asset, onClose, onDelete, onUpdate, workspaceId, allTags = [] }) => {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localTags, setLocalTags] = useState(asset?.tags || []);
  const [localDescription, setLocalDescription] = useState(asset?.description || '');

  // Reset local state when asset changes (intentionally keyed on asset.id only)
  useEffect(() => {
    setLocalTags(asset?.tags || []);
    setLocalDescription(asset?.description || '');
    setCopied(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!asset) return null;

  const isVideo = asset.file_type?.startsWith('video/');

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(asset.public_url);
    setCopied(true);
    toast({
      title: 'URL copied',
      status: 'success',
      duration: 2000,
      isClosable: true
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveTags = async (newTags) => {
    setLocalTags(newTags);
    setIsSaving(true);
    try {
      const res = await fetch(`${baseURL}/api/media/assets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: asset.id,
          workspaceId,
          tags: newTags
        })
      });
      const data = await res.json();
      if (data.success && onUpdate) {
        onUpdate(data.data.asset);
      }
    } catch (err) {
      console.error('Failed to save tags:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDescription = async () => {
    if (localDescription === (asset.description || '')) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${baseURL}/api/media/assets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: asset.id,
          workspaceId,
          description: localDescription
        })
      });
      const data = await res.json();
      if (data.success && onUpdate) {
        onUpdate(data.data.asset);
      }
    } catch (err) {
      console.error('Failed to save description:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="asset-panel-overlay" onClick={onClose} />
      <div className="asset-detail-panel">
        <div className="asset-panel-header">
          <h3>Asset Details</h3>
          <button className="asset-panel-close" onClick={onClose}>
            <FiX size={20} />
          </button>
        </div>

        <div className="asset-panel-content">
          {/* Preview */}
          <div className="asset-panel-preview">
            {isVideo ? (
              <video src={asset.public_url} controls />
            ) : (
              <img src={asset.public_url} alt={asset.file_name} />
            )}
          </div>

          {/* File Info */}
          <div className="asset-panel-section">
            <label>File Name</label>
            <p className="asset-panel-filename">{asset.file_name}</p>
          </div>

          <div className="asset-panel-meta-row">
            <div className="asset-panel-meta-item">
              <label>Type</label>
              <span className="asset-panel-meta-value">
                {isVideo ? <FiVideo size={14} /> : <FiImage size={14} />}
                {asset.file_type}
              </span>
            </div>
            <div className="asset-panel-meta-item">
              <label>Size</label>
              <span className="asset-panel-meta-value">{formatBytes(asset.file_size)}</span>
            </div>
          </div>

          <div className="asset-panel-section">
            <label>Uploaded</label>
            <p className="asset-panel-meta-value">{formatDate(asset.created_at)}</p>
          </div>

          {/* Public URL */}
          <div className="asset-panel-section">
            <label>Public URL</label>
            <div className="asset-panel-url-row">
              <input
                type="text"
                className="asset-panel-url-input"
                value={asset.public_url}
                readOnly
              />
              <button className="asset-panel-copy-btn" onClick={handleCopyUrl}>
                {copied ? <FiCheck size={16} /> : <FiCopy size={16} />}
              </button>
            </div>
          </div>

          {/* Tags */}
          <div className="asset-panel-section">
            <label>Tags {isSaving && <span className="saving-indicator">Saving...</span>}</label>
            <AssetTagEditor
              tags={localTags}
              onChange={handleSaveTags}
              allTags={allTags}
            />
          </div>

          {/* Description */}
          <div className="asset-panel-section">
            <label>Description</label>
            <textarea
              className="asset-panel-description"
              placeholder="Add a description..."
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={handleSaveDescription}
              rows={3}
            />
          </div>

          {/* Delete */}
          <div className="asset-panel-delete-section">
            <button className="asset-panel-delete-btn" onClick={() => onDelete(asset)}>
              <FiTrash2 size={16} />
              Delete Asset
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AssetDetailsPanel;
