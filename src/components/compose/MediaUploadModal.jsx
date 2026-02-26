import { useState, useRef, useEffect } from 'react';
import { RecentMediaGrid } from './RecentMediaGrid';
import { AssetLibraryGrid } from './AssetLibraryGrid';
import './MediaUploadModal.css';

const VALID_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const VALID_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_FILES = 10;

export const MediaUploadModal = ({
  isOpen,
  onClose,
  onConfirm,
  existingFiles = [],
  maxFiles = MAX_FILES,
  maxFileSize = MAX_FILE_SIZE,
  maxTotalSize = MAX_TOTAL_SIZE,
  workspaceId,
  userId
}) => {
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // Load existing files when modal opens (clear previous state)
  useEffect(() => {
    if (isOpen) {
      // Clear previous state when modal opens
      setSelectedFiles([]);
      setValidationErrors([]);
      setIsDragging(false);
      setDraggedItemIndex(null);
      setActiveTab('upload');

      // Load existing files if any
      if (existingFiles && existingFiles.length > 0) {
        processFiles(existingFiles);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const validateFile = (file) => {
    const errors = [];
    const allValidTypes = [...VALID_IMAGE_TYPES, ...VALID_VIDEO_TYPES];

    if (!allValidTypes.includes(file.type.toLowerCase())) {
      errors.push(`${file.name}: Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, MOV, WebM) are allowed.`);
    }

    if (file.size > maxFileSize) {
      errors.push(`${file.name}: File size (${formatFileSize(file.size)}) exceeds ${formatFileSize(maxFileSize)} limit.`);
    }

    return errors;
  };

  const validateAllFiles = (files) => {
    const errors = [];

    if (files.length > maxFiles) {
      errors.push(`Maximum ${maxFiles} files allowed. You selected ${files.length} files.`);
    }

    const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
    if (totalSize > maxTotalSize) {
      errors.push(`Total file size (${formatFileSize(totalSize)}) exceeds ${formatFileSize(maxTotalSize)} limit.`);
    }

    files.forEach(fileObj => {
      errors.push(...validateFile(fileObj.file));
    });

    return errors;
  };

  const processFiles = async (files) => {
    setIsProcessing(true);

    try {
      const fileObjects = await Promise.all(
        Array.from(files).map((file, index) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve({
                id: `${Date.now()}-${index}-${Math.random()}`,
                file,
                preview: reader.result,
                type: file.type.split('/')[0],
                size: file.size,
                order: selectedFiles.length + index
              });
            };
            reader.readAsDataURL(file);
          });
        })
      );

      const newFiles = [...selectedFiles, ...fileObjects];
      setSelectedFiles(newFiles);

      // Validate
      const errors = validateAllFiles(newFiles);
      setValidationErrors(errors);
    } catch (error) {
      console.error('Error processing files:', error);
      setValidationErrors([`Error processing files: ${error.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Drag and drop handlers for drop zone
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await processFiles(files);
    }
  };

  // File input handlers
  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFiles(files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  // Remove file
  const handleRemove = (fileId) => {
    const newFiles = selectedFiles.filter(f => f.id !== fileId);
    setSelectedFiles(newFiles);

    // Re-validate
    const errors = validateAllFiles(newFiles);
    setValidationErrors(errors);
  };

  // Drag to reorder handlers
  const handleDragStart = (e, index) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverItem = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropItem = (e, dropIndex) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedItemIndex === null || draggedItemIndex === dropIndex) {
      setDraggedItemIndex(null);
      return;
    }

    const newFiles = [...selectedFiles];
    const [draggedFile] = newFiles.splice(draggedItemIndex, 1);
    newFiles.splice(dropIndex, 0, draggedFile);

    // Update order property
    newFiles.forEach((file, idx) => {
      file.order = idx;
    });

    setSelectedFiles(newFiles);
    setDraggedItemIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedItemIndex(null);
  };

  // Confirm selection from Upload tab
  const handleConfirm = () => {
    if (selectedFiles.length === 0 || validationErrors.length > 0) {
      return;
    }

    // Return files in order
    const orderedFiles = selectedFiles
      .sort((a, b) => a.order - b.order)
      .map(f => f.file);

    onConfirm({ files: orderedFiles, urls: [] });
  };

  // Handle selection from Recent or Library tabs (URL-based)
  const handleUrlSelect = (selectedUrls) => {
    if (!selectedUrls || selectedUrls.length === 0) return;
    onConfirm({ files: [], urls: selectedUrls });
  };

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  const hasErrors = validationErrors.length > 0;

  const tabs = [
    { id: 'upload', label: 'Upload', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )},
    { id: 'recent', label: 'Recent', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 8V12L15 15M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )},
    { id: 'library', label: 'Library', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M19 11H5M19 11C20.1046 11 21 11.8954 21 13V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V13C3 11.8954 3.89543 11 5 11M19 11V9C19 7.89543 18.1046 7 17 7M5 11V9C5 7.89543 5.89543 7 7 7M7 7V5C7 3.89543 7.89543 3 9 3H15C16.1046 3 17 3.89543 17 5V7M7 7H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )}
  ];

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="media-upload-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {activeTab === 'upload' ? 'Upload Media' : activeTab === 'recent' ? 'Recent Media' : 'Asset Library'}
          </h2>
          <button
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div className="media-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`media-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="modal-body">
          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <>
              {/* Drag and drop zone */}
              <div
                className={`drop-zone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleBrowseClick}
                role="button"
                tabIndex={0}
                aria-label="Upload media files. Drag and drop files here or click to browse."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBrowseClick();
                  }
                }}
              >
                <div className="drop-zone-content">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15M17 8L12 3M12 3L7 8M12 3V15"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="drop-zone-text">
                    {isDragging ? 'Drop files here' : 'Drag & drop files here'}
                  </p>
                  <span className="drop-zone-or">or</span>
                  <button
                    type="button"
                    className="browse-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBrowseClick();
                    }}
                  >
                    Browse Files
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <p className="drop-zone-hint">
                    Supports: Images (JPEG, PNG, GIF, WebP) and Videos (MP4, MOV, WebM)
                  </p>
                </div>
              </div>

              {/* File previews grid */}
              {selectedFiles.length > 0 && (
                <div className="media-preview-grid">
                  {selectedFiles.map((fileObj, index) => (
                    <div
                      key={fileObj.id}
                      className={`media-preview-item ${draggedItemIndex === index ? 'dragging-item' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOverItem}
                      onDrop={(e) => handleDropItem(e, index)}
                      onDragEnd={handleDragEnd}
                      role="listitem"
                      aria-label={`File ${index + 1} of ${selectedFiles.length}: ${fileObj.file.name}`}
                    >
                      <div className="preview-thumbnail">
                        {fileObj.type === 'image' ? (
                          <img src={fileObj.preview} alt={fileObj.file.name} />
                        ) : (
                          <video src={fileObj.preview} />
                        )}
                      </div>
                      <button
                        className="remove-btn"
                        onClick={() => handleRemove(fileObj.id)}
                        aria-label={`Remove ${fileObj.file.name}`}
                        type="button"
                      >
                        ✕
                      </button>
                      <div className="file-info">
                        <span className="file-name" title={fileObj.file.name}>
                          {fileObj.file.name.length > 15
                            ? fileObj.file.name.substring(0, 12) + '...'
                            : fileObj.file.name}
                        </span>
                        <span className="file-size">{formatFileSize(fileObj.size)}</span>
                      </div>
                      <div className="reorder-indicator">{index + 1}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Validation errors */}
              {hasErrors && (
                <div className="validation-errors" role="alert">
                  {validationErrors.map((error, idx) => (
                    <div key={idx} className="error-message">
                      ⚠ {error}
                    </div>
                  ))}
                </div>
              )}

              {/* File count and size info */}
              <div className="upload-info">
                <span className="upload-info-item">
                  <strong>{selectedFiles.length}</strong> / {maxFiles} files
                </span>
                <span className="upload-info-item">
                  <strong>{formatFileSize(totalSize)}</strong> / {formatFileSize(maxTotalSize)}
                </span>
              </div>

              {/* Processing indicator */}
              {isProcessing && (
                <div className="processing-indicator">
                  Processing files...
                </div>
              )}
            </>
          )}

          {/* Recent Media Tab */}
          {activeTab === 'recent' && (
            <RecentMediaGrid
              workspaceId={workspaceId}
              userId={userId}
              onSelect={handleUrlSelect}
              maxSelectable={maxFiles}
            />
          )}

          {/* Library Tab */}
          {activeTab === 'library' && (
            <AssetLibraryGrid
              workspaceId={workspaceId}
              userId={userId}
              onSelect={handleUrlSelect}
              maxSelectable={maxFiles}
            />
          )}
        </div>

        {/* Footer only shows for Upload tab */}
        {activeTab === 'upload' && (
          <div className="modal-footer">
            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-confirm"
              onClick={handleConfirm}
              disabled={selectedFiles.length === 0 || hasErrors || isProcessing}
            >
              Add {selectedFiles.length} {selectedFiles.length === 1 ? 'File' : 'Files'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaUploadModal;
