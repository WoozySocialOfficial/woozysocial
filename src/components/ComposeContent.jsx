import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./ComposeContent.css";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaPinterest, FaGoogle } from "react-icons/fa";
import { FaTiktok, FaThreads, FaBluesky } from "react-icons/fa6";
import { SiX } from "react-icons/si";
import { useToast, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Button, useDisclosure } from "@chakra-ui/react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { baseURL } from "../utils/constants";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useConnectedAccounts, useInvalidateQueries } from "../hooks/useQueries";
import { supabase, uploadMediaDirect } from "../utils/supabaseClient";
import { formatDateInTimezone } from "../utils/timezones";
import { SubscriptionGuard } from "./subscription/SubscriptionGuard";
import FeatureGate from "./subscription/FeatureGate";
import { CommentThread } from "./comments/CommentThread";
import { CommentInput } from "./comments/CommentInput";
import { MediaUploadModal } from "./compose/MediaUploadModal";
import { PostSettings } from "./compose/PostSettings";
import { ScheduleModal } from "./compose/ScheduleModal";
import { InstagramPreview } from "./compose/previews/InstagramPreview";
import { TwitterPreview } from "./compose/previews/TwitterPreview";
import { FacebookPreview } from "./compose/previews/FacebookPreview";
import { LinkedInPreview } from "./compose/previews/LinkedInPreview";
import { TikTokPreview } from "./compose/previews/TikTokPreview";
import { ThreadsPreview } from "./compose/previews/ThreadsPreview";

export const ComposeContent = () => {
  const navigate = useNavigate();
  const { user, profile, hasActiveProfile, subscriptionStatus, isWhitelisted } = useAuth();
  const { activeWorkspace } = useWorkspace();

  // Check if user has access (multi-workspace support)
  // User has access if: active profile, whitelisted, active subscription, or workspace has profile
  const workspaceHasProfile = !!activeWorkspace?.ayr_profile_key;
  const canPost = hasActiveProfile ||
    isWhitelisted ||
    profile?.is_whitelisted ||
    subscriptionStatus === 'active' ||
    workspaceHasProfile;

  const [post, setPost] = useState({ text: "", media: [] });
  const [networks, setNetworks] = useState({
    threads: false,
    twitter: false,
    googleBusiness: false,
    pinterest: false,
    tiktok: false,
    instagram: false,
    bluesky: false,
    youtube: false,
    linkedin: false,
    facebook: false
  });
  const [mediaPreviews, setMediaPreviews] = useState([]);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [postingProgress, setPostingProgress] = useState({
    step: '',        // 'uploading' | 'saving' | 'publishing'
    percent: 0,
    estimatedTime: 0
  });
  const [selectedPreviewPlatform, setSelectedPreviewPlatform] = useState("instagram");
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [isEditingScheduledPost, setIsEditingScheduledPost] = useState(false); // Track if editing a scheduled post
  const [approvalStatus, setApprovalStatus] = useState(null); // Track approval status
  const [lastSaved, setLastSaved] = useState(null);
  const autoSaveTimerRef = useRef(null);
  const isSavingRef = useRef(false); // Lock to prevent concurrent saves
  const progressIntervalRef = useRef(null); // For progress countdown
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isAiOpen, onOpen: onAiOpen, onClose: onAiClose } = useDisclosure();
  const [mediaWarnings, setMediaWarnings] = useState([]);
  const [engagementScore, setEngagementScore] = useState(0);
  const [bestPostingTime, setBestPostingTime] = useState("2:00 PM");
  const [hasRealData, setHasRealData] = useState(false);
  const [predictionRun, setPredictionRun] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [scoreBreakdown, setScoreBreakdown] = useState(null);

  // Analytics data for insights
  const [analyticsData, setAnalyticsData] = useState(null);
  const [bestTimes, setBestTimes] = useState([]);

  // AI Generation state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiWebsiteUrl, setAiWebsiteUrl] = useState("");
  const [aiVariations, setAiVariations] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Hashtag generation state
  const [isGeneratingHashtags, setIsGeneratingHashtags] = useState(false);

  // Link shortening state
  const [showLinkShortener, setShowLinkShortener] = useState(false);
  const [urlToShorten, setUrlToShorten] = useState("");
  const [shortenedLink, setShortenedLink] = useState(null);
  const [isShorteningLink, setIsShorteningLink] = useState(false);

  // Post settings state (Phase 4)
  const [postSettings, setPostSettings] = useState({
    shortenLinks: false,
    threadPost: false,
    threadNumber: true,
    instagramType: 'feed'
  });

  // Use React Query for connected accounts
  const { data: accountsData } = useConnectedAccounts(activeWorkspace?.id, user?.id);
  const connectedAccounts = accountsData?.accounts || [];
  const accountDetails = accountsData?.accountDetails || [];

  // Cache invalidation helpers
  const { invalidatePosts, invalidateAccounts } = useInvalidateQueries();

  // Helper to get account info for a platform
  const getAccountInfo = (platform) => {
    const account = accountDetails.find(a =>
      a.platform?.toLowerCase() === platform?.toLowerCase()
    );
    return {
      username: account?.username || profile?.business_name || 'your_username',
      profilePicture: account?.profilePicture || null
    };
  };

  // Helper to get video dimensions from a File
  const getVideoDimensions = (file) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
      };
      video.onerror = () => {
        resolve({ width: 0, height: 0, duration: 0 });
      };
      video.src = URL.createObjectURL(file);
    });
  };

  // Validate video for platform requirements
  const validateVideoForPlatforms = async (file) => {
    const warnings = [];
    const { width, height, duration } = await getVideoDimensions(file);
    const fileSizeMB = file.size / (1024 * 1024);

    // Platform requirements
    const requirements = {
      tiktok: { minWidth: 360, minHeight: 360, maxWidth: 4096, maxHeight: 4096, maxDuration: 180, maxSizeMB: 287 },
      instagram: { minWidth: 320, minHeight: 320, maxWidth: 1920, maxHeight: 1920, maxDuration: 90, maxSizeMB: 100 },
      facebook: { minWidth: 120, minHeight: 120, maxDuration: 240, maxSizeMB: 4096 },
      youtube: { minWidth: 426, minHeight: 240, maxDuration: 43200, maxSizeMB: 256000 },
      pinterest: { minWidth: 360, minHeight: 360, maxDuration: 900, maxSizeMB: 2048, requiresThumbnail: true },
      linkedin: { minWidth: 256, minHeight: 144, maxDuration: 600, maxSizeMB: 5120 },
      twitter: { minWidth: 32, minHeight: 32, maxDuration: 140, maxSizeMB: 512 }
    };

    for (const [platform, req] of Object.entries(requirements)) {
      const issues = [];

      if (width < req.minWidth || height < req.minHeight) {
        issues.push(`too small (${width}x${height}px, needs ${req.minWidth}x${req.minHeight}px min)`);
      }
      if (req.maxWidth && (width > req.maxWidth || height > req.maxHeight)) {
        issues.push(`too large (${width}x${height}px, max ${req.maxWidth}x${req.maxHeight}px)`);
      }
      if (duration > req.maxDuration) {
        issues.push(`too long (${Math.round(duration)}s, max ${req.maxDuration}s)`);
      }
      if (fileSizeMB > req.maxSizeMB) {
        issues.push(`file too big (${fileSizeMB.toFixed(1)}MB, max ${req.maxSizeMB}MB)`);
      }
      if (req.requiresThumbnail) {
        issues.push(`requires thumbnail image`);
      }

      if (issues.length > 0) {
        warnings.push({ platform, issues, width, height, duration: Math.round(duration), sizeMB: fileSizeMB.toFixed(1) });
      }
    }

    return { width, height, duration, fileSizeMB, warnings };
  };

  // Progress countdown effect - makes the timer feel realistic
  useEffect(() => {
    if (isLoading && postingProgress.step && postingProgress.step !== 'complete') {
      // Clear any existing interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      // Start countdown interval
      progressIntervalRef.current = setInterval(() => {
        setPostingProgress(prev => {
          if (prev.estimatedTime <= 1 || prev.step === 'complete') {
            return prev;
          }

          // Calculate progress based on step
          let targetPercent = prev.percent;
          if (prev.step === 'uploading') {
            targetPercent = Math.min(prev.percent + 2, 45);
          } else if (prev.step === 'publishing') {
            targetPercent = Math.min(prev.percent + 3, 95);
          }

          return {
            ...prev,
            percent: targetPercent,
            estimatedTime: Math.max(0, prev.estimatedTime - 1)
          };
        });
      }, 1000);

      return () => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      };
    } else {
      // Clear interval when not loading
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
  }, [isLoading, postingProgress.step]);

  // Fetch real analytics data for best posting time and insights
  useEffect(() => {
    const fetchAnalyticsData = async () => {
      if (!user || !activeWorkspace) return;

      try {
        const selectedPlatform = Object.keys(networks).find(key => networks[key]);
        const platformParam = selectedPlatform ? `&platform=${selectedPlatform}` : '';
        const workspaceTimezone = activeWorkspace?.timezone || 'UTC';
        const timezoneParam = `&timezone=${encodeURIComponent(workspaceTimezone)}`;

        // Fetch best time recommendations (with timezone for accurate local times)
        const bestTimeRes = await fetch(
          `${baseURL}/api/best-time?workspaceId=${activeWorkspace.id}${platformParam}${timezoneParam}`
        );
        if (bestTimeRes.ok) {
          const json = await bestTimeRes.json();
          const data = json.data || json;
          if (data.recommendations && data.recommendations.length > 0) {
            const best = data.recommendations[0];
            setBestPostingTime(`${best?.day || ''} ${best?.time || ''}`);
            setBestTimes(data.recommendations);
            setHasRealData(data.source === 'personalized');
          } else {
            setHasRealData(false);
          }
        }

        // Fetch analytics summary (7 days) with timezone
        const analyticsRes = await fetch(
          `${baseURL}/api/analytics?workspaceId=${activeWorkspace.id}&period=7${timezoneParam}`
        );
        if (analyticsRes.ok) {
          const json = await analyticsRes.json();
          const data = json.data || json;
          setAnalyticsData(data);
        }
      } catch (err) {
        console.error("Error fetching analytics:", err);
        setHasRealData(false);
      }
    };
    fetchAnalyticsData();
  }, [user, activeWorkspace, networks]);

  // Helper function to convert data URL back to File object
  const convertDataUrlToFile = async (dataUrl) => {
    try {
      const res = await fetch(dataUrl);
      if (!res.ok) {
        throw new Error("Failed to convert data URL");
      }
      const blob = await res.blob();
      const ext = blob.type?.split('/')?.[1] || 'bin';
      const filename = `draft-media-${Date.now()}.${ext}`;
      return new File([blob], filename, { type: blob.type });
    } catch (error) {
      console.error("Error converting data URL to file:", error);
      return null;
    }
  };

  // Helper function to load draft data into state
  const loadDraftIntoState = useCallback((draft, showToast = true) => {
    // Set the draft ID so we update instead of create new
    setCurrentDraftId(draft.id);

    // Check if this is editing a scheduled post
    if (draft.isEditingScheduledPost) {
      setIsEditingScheduledPost(true);
    }

    // Load approval status
    if (draft.approval_status) {
      setApprovalStatus(draft.approval_status);
      console.log('[loadDraft] Loaded approval status:', draft.approval_status);
    } else {
      console.log('[loadDraft] No approval_status in draft:', draft);
    }

    // Load caption
    if (draft.caption) {
      setPost(prev => ({ ...prev, text: draft.caption }));
    }

    // Load media previews
    if (draft.media_urls && draft.media_urls.length > 0) {
      const previews = draft.media_urls.filter(Boolean).map((mediaUrl, index) => {
        // Determine media type
        const url = (mediaUrl || '').toLowerCase();
        const type = (url.includes('video') || url.endsWith('.mp4') || url.endsWith('.mov')) ? 'video' : 'image';

        return {
          id: `draft-${index}-${Date.now()}`,
          dataUrl: mediaUrl,
          type,
          order: index
        };
      });

      setMediaPreviews(previews);

      // If data URLs, convert to File objects for upload
      const dataUrlFiles = draft.media_urls.filter(url => url.startsWith('data:'));
      if (dataUrlFiles.length > 0) {
        Promise.all(dataUrlFiles.map(url => convertDataUrlToFile(url)))
          .then(files => {
            const validFiles = files.filter(f => f !== null);
            if (validFiles.length > 0) {
              setPost(prev => ({ ...prev, media: validFiles }));
            }
          });
      }
    }

    // Load selected platforms
    if (draft.platforms && draft.platforms.length > 0) {
      const platformsObj = {};
      Object.keys(networks).forEach(key => {
        platformsObj[key] = draft.platforms.includes(key);
      });
      setNetworks(platformsObj);
    }

    // Load scheduled date
    if (draft.scheduled_date) {
      const schedDate = new Date(draft.scheduled_date);
      setScheduledDate(schedDate);
      setTempScheduledDate(schedDate); // Also set temp for consistency
      console.log('[loadDraft] Loaded scheduled date:', schedDate);
    }

    // Load post settings
    if (draft.post_settings) {
      setPostSettings(draft.post_settings);
      console.log('[loadDraft] Loaded post settings:', draft.post_settings);
    }

    if (showToast) {
      toast({
        title: "Draft loaded",
        description: "Continue editing your draft",
        status: "info",
        duration: 2000,
        isClosable: true
      });
    }
  }, [networks, toast]);

  // Load draft from sessionStorage if coming from Posts page
  // This is the ONLY way to load drafts - user must explicitly select "Continue Editing" from Posts page
  useEffect(() => {
    const loadDraftData = sessionStorage.getItem("loadDraft");
    if (loadDraftData) {
      try {
        const draft = JSON.parse(loadDraftData);
        loadDraftIntoState(draft, true);
        // Clear from sessionStorage
        sessionStorage.removeItem("loadDraft");
      } catch (error) {
        console.error("Error loading draft:", error);
      }
    }
  }, [loadDraftIntoState]);

  // Auto-save draft functionality
  const saveDraft = useCallback(async () => {
    if (!user || !activeWorkspace?.id) return;

    // Prevent concurrent saves
    if (isSavingRef.current) return;

    // Don't save if there's no content
    const selectedPlatforms = Object.keys(networks).filter(key => networks[key]);
    if (!post.text && mediaPreviews.length === 0 && selectedPlatforms.length === 0) {
      return;
    }

    isSavingRef.current = true;

    try {
      // Separate data URLs (local files) from HTTP URLs (already uploaded)
      const dataUrlPreviews = mediaPreviews.filter(p => p.dataUrl && p.dataUrl.startsWith('data:'));
      const httpUrlPreviews = mediaPreviews.filter(p => p.dataUrl && p.dataUrl.startsWith('http'));

      let uploadedUrls = httpUrlPreviews.map(p => p.dataUrl);

      // Upload local media files to storage if any exist
      if (dataUrlPreviews.length > 0 && post.media && post.media.length > 0) {
        const MAX_VERCEL_SIZE = 4 * 1024 * 1024; // 4MB
        const largeFiles = post.media.filter(f => f instanceof File && f.size > MAX_VERCEL_SIZE);
        const smallFiles = post.media.filter(f => f instanceof File && f.size <= MAX_VERCEL_SIZE);

        // Upload large files directly to Supabase (bypass Vercel limit)
        if (largeFiles.length > 0) {
          console.log('[Draft] Uploading large files directly to Supabase...');
          for (const file of largeFiles) {
            const result = await uploadMediaDirect(file, user.id, activeWorkspace.id);
            if (result.success && result.publicUrl) {
              uploadedUrls.push(result.publicUrl);
            } else {
              console.warn('[Draft] Large file upload failed:', result.error);
            }
          }
        }

        // Upload small files via API (normal flow)
        if (smallFiles.length > 0) {
          const formData = new FormData();
          formData.append("workspaceId", activeWorkspace.id);
          formData.append("userId", user.id);

          smallFiles.forEach((file) => {
            formData.append("media", file);
          });

          const uploadRes = await fetch(`${baseURL}/api/drafts/upload-media`, {
            method: "POST",
            body: formData
          });

          if (uploadRes.ok) {
            const uploadJson = await uploadRes.json();
            uploadedUrls = [...uploadedUrls, ...(uploadJson.urls || [])];
          } else {
            console.warn("[Draft] Small file upload failed, saving text only");
          }
        }

        // IMPORTANT: Clear File objects after successful upload to prevent 413 errors
        if ((largeFiles.length > 0 || smallFiles.length > 0) && uploadedUrls.length > 0) {
          console.log('[Draft] Clearing File objects after upload, updating previews with URLs');
          // Clear the media array (File objects)
          setPost(prev => ({ ...prev, media: [] }));
          // Update previews to use the uploaded URLs
          setMediaPreviews(uploadedUrls.map((url, idx) => ({
            dataUrl: url,
            type: url.match(/\.(mp4|mov|avi|webm|mkv)$/i) ? 'video' : 'image',
            id: idx
          })));
        }
      }

      // NEW: Check if editing a scheduled post
      if (isEditingScheduledPost && currentDraftId) {
        // Save to posts table (scheduled post) - AUTO-SAVE ONLY, no Ayrshare call
        console.log('[Draft] Auto-saving scheduled post to posts table, id:', currentDraftId);

        const { error } = await supabase
          .from('posts')
          .update({
            caption: post.text,
            media_urls: uploadedUrls,
            platforms: selectedPlatforms,
            scheduled_at: scheduledDate ? scheduledDate.toISOString() : null,
            post_settings: postSettings,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentDraftId)
          .eq('workspace_id', activeWorkspace.id);

        if (error) throw error;

        setLastSaved(new Date());
        console.log('[Draft] Scheduled post auto-saved successfully');

        // Invalidate cache
        invalidatePosts(activeWorkspace?.id);
      } else {
        // Original flow - save to post_drafts table
        const res = await fetch(`${baseURL}/api/drafts/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: activeWorkspace.id,
            userId: user.id,
            draftId: currentDraftId || null,
            caption: post.text,
            mediaUrls: uploadedUrls,
            platforms: selectedPlatforms,
            scheduledDate: scheduledDate ? scheduledDate.toISOString() : null
          })
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to save draft");
        }

        const json = await res.json();
        if (json.data && !currentDraftId) {
          setCurrentDraftId(json.data.id);
        }

        setLastSaved(new Date());
        console.log("[Draft] Saved successfully, id:", json.data?.id || currentDraftId);

        // Invalidate cache so Posts page shows the new/updated draft immediately
        invalidatePosts(activeWorkspace?.id);
      }
    } catch (error) {
      console.error("Error saving draft:", error);
      // Show error toast so user knows draft didn't save
      toast({
        title: "Draft save failed",
        description: error.message || "Could not save your draft",
        status: "error",
        duration: 3000,
        isClosable: true
      });
    } finally {
      isSavingRef.current = false;
    }
  }, [user, activeWorkspace?.id, post.text, mediaPreviews, networks, scheduledDate, currentDraftId, isEditingScheduledPost, postSettings, toast, supabase, invalidatePosts]);

  // Auto-save draft every 30 seconds when there's content
  // DISABLED for editing scheduled posts - no need to autosave existing posts
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Skip autosave when editing scheduled posts
    if (isEditingScheduledPost) {
      return;
    }

    if (post.text || mediaPreviews.length > 0 || Object.values(networks).some(v => v)) {
      autoSaveTimerRef.current = setTimeout(() => {
        saveDraft();
      }, 30000);
    }
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [post.text, mediaPreviews, networks, saveDraft, isEditingScheduledPost]);

  // Save draft when navigating away
  // DISABLED for editing scheduled posts - no need to autosave existing posts
  useEffect(() => {
    // Skip autosave when editing scheduled posts
    if (isEditingScheduledPost) {
      return;
    }

    const handleBeforeUnload = () => {
      saveDraft();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      saveDraft();
    };
  }, [saveDraft, isEditingScheduledPost]);

  // Listen for social accounts updates from other components
  useEffect(() => {
    const handleAccountsUpdated = () => {
      // Invalidate connected accounts cache so newly connected accounts appear immediately
      invalidateAccounts(activeWorkspace?.id || user?.id);
    };

    window.addEventListener('socialAccountsUpdated', handleAccountsUpdated);
    return () => window.removeEventListener('socialAccountsUpdated', handleAccountsUpdated);
  }, [activeWorkspace?.id, user?.id, invalidateAccounts]);

  // Calculate engagement score based on post content - MANUAL TRIGGER
  const runPrediction = () => {
    setIsPredicting(true);

    // Simulate brief processing time for UX
    setTimeout(() => {
      let score = 0;
      const text = post.text || "";
      const textLength = text.length;
      const selectedPlatforms = Object.keys(networks).filter(key => networks[key]);

      // Platform-specific optimal lengths (based on engagement studies)
      const platformOptimalLengths = {
        twitter: { min: 71, max: 100 },      // 71-100 chars get most retweets
        instagram: { min: 138, max: 150 },   // Short captions perform better
        facebook: { min: 40, max: 80 },      // Short posts get 23% more engagement
        linkedin: { min: 50, max: 100 },     // Concise professional content
        threads: { min: 50, max: 150 },
        tiktok: { min: 50, max: 150 },
        pinterest: { min: 100, max: 200 },   // Descriptive works better
        youtube: { min: 100, max: 200 }
      };

      // 1. TEXT LENGTH SCORE (max 18 points) - Platform aware
      let lengthScore = 0;
      if (selectedPlatforms.length > 0) {
        const avgOptimal = selectedPlatforms.reduce((acc, p) => {
          const opt = platformOptimalLengths[p] || { min: 80, max: 150 };
          return { min: acc.min + opt.min, max: acc.max + opt.max };
        }, { min: 0, max: 0 });
        avgOptimal.min /= selectedPlatforms.length;
        avgOptimal.max /= selectedPlatforms.length;

        if (textLength >= avgOptimal.min && textLength <= avgOptimal.max) {
          lengthScore = 18;
        } else if (textLength >= avgOptimal.min * 0.7 && textLength <= avgOptimal.max * 1.3) {
          lengthScore = 12;
        } else if (textLength > 0) {
          lengthScore = 6;
        }
      } else if (textLength >= 80 && textLength <= 150) {
        lengthScore = 18;
      } else if (textLength > 0) {
        lengthScore = 8;
      }
      score += lengthScore;

      // 2. HASHTAG SCORE (max 12 points) - Platform specific
      const hashtags = text.match(/#\w+/g) || [];
      const hashtagCount = hashtags.length;
      let hashtagScore = 0;
      if (selectedPlatforms.includes('instagram') && hashtagCount >= 5 && hashtagCount <= 10) {
        hashtagScore = 12;
      } else if (hashtagCount >= 2 && hashtagCount <= 5) {
        hashtagScore = 10;
      } else if (hashtagCount >= 1 && hashtagCount <= 8) {
        hashtagScore = 6;
      } else if (hashtagCount > 10) {
        hashtagScore = 3; // Too many hashtags looks spammy
      }
      score += hashtagScore;

      // 3. MEDIA SCORE (max 20 points)
      let mediaScore = 0;
      if (mediaPreviews.length > 0) {
        mediaScore = 18;
        const hasVideo = mediaPreviews.some(p => p.type === 'video');
        if (hasVideo) mediaScore = 20;
      }
      score += mediaScore;

      // 4. EMOJI USAGE (max 8 points) - Emojis boost engagement 25%+
      const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
      const emojiCount = (text.match(emojiRegex) || []).length;
      let emojiScore = 0;
      if (emojiCount >= 1 && emojiCount <= 3) {
        emojiScore = 8;
      } else if (emojiCount >= 4 && emojiCount <= 6) {
        emojiScore = 5;
      } else if (emojiCount > 6) {
        emojiScore = 2;
      }
      score += emojiScore;

      // 5. ENGAGEMENT HOOKS (max 15 points)
      let hookScore = 0;
      const hasQuestion = /\?/.test(text);
      const hasCTA = /\b(click|link|check|visit|shop|buy|learn|sign up|join|follow|subscribe|download|try|get|grab|save|share|tag|comment|tell us|let us know|drop a|what do you think|swipe|tap)\b/i.test(text);
      const hasUrgency = /\b(now|today|limited|exclusive|don't miss|last chance|hurry|act fast|ending soon|only)\b/i.test(text);
      const hasListFormat = /\b\d+\s*(tips|ways|reasons|steps|things|ideas|hacks|secrets|mistakes|facts)\b/i.test(text);
      if (hasQuestion) hookScore += 5;
      if (hasCTA) hookScore += 5;
      if (hasUrgency) hookScore += 3;
      if (hasListFormat) hookScore += 2;
      score += Math.min(hookScore, 15);

      // 6. FIRST LINE HOOK (max 12 points) - First 125 chars are crucial
      const firstLine = text.split('\n')[0] || text.substring(0, 60);
      let firstLineScore = 0;
      if (firstLine.length >= 20) firstLineScore += 3;
      const hasEmojiOpener = /^[🔥⚡💡🚀✨🎯💪🙌]/.test(firstLine);
      const hasFirstLinePunctuation = /\?|!/.test(firstLine);
      const hasPowerWords = /\b(how|why|what|secret|truth|mistake|stop|start|never|always|this|here's|introducing|finally|breaking|just|new)\b/i.test(firstLine);
      if (hasEmojiOpener) firstLineScore += 2;
      if (hasFirstLinePunctuation) firstLineScore += 3;
      if (hasPowerWords) firstLineScore += 4;
      score += Math.min(firstLineScore, 12);

      // 7. PLATFORM SELECTION (max 10 points)
      let platformScore = 0;
      if (selectedPlatforms.length >= 2 && selectedPlatforms.length <= 4) {
        platformScore = 10;
      } else if (selectedPlatforms.length === 1) {
        platformScore = 7;
      } else if (selectedPlatforms.length > 4) {
        platformScore = 5;
      }
      score += platformScore;

      // 8. URL/LINK PRESENCE (max 5 points) - CTAs with links convert better
      const hasUrl = /https?:\/\/[^\s]+/i.test(text);
      let urlScore = hasUrl ? 5 : 0;
      score += urlScore;

      // Store breakdown for improvement suggestions
      setScoreBreakdown({
        length: { score: lengthScore, max: 18, textLength, selectedPlatforms },
        hashtags: { score: hashtagScore, max: 12, count: hashtagCount, selectedPlatforms },
        media: { score: mediaScore, max: 20, count: mediaPreviews.length },
        emoji: { score: emojiScore, max: 8, count: emojiCount },
        hooks: { score: Math.min(hookScore, 15), max: 15, hasQuestion, hasCTA, hasUrgency, hasListFormat },
        firstLine: { score: Math.min(firstLineScore, 12), max: 12, length: firstLine.length, hasEmojiOpener, hasFirstLinePunctuation, hasPowerWords },
        platforms: { score: platformScore, max: 10, count: selectedPlatforms.length },
        url: { score: urlScore, max: 5, hasUrl }
      });

      // Cap at 100
      setEngagementScore(Math.min(score, 100));
      setPredictionRun(true);
      setIsPredicting(false);
    }, 800); // Brief delay for UX
  };

  // Reset prediction when content changes significantly
  useEffect(() => {
    if (predictionRun) {
      setPredictionRun(false);
      setEngagementScore(0);
    }
  }, [post.text, mediaPreviews.length, Object.keys(networks).filter(k => networks[k]).length]);

  // Map Ayrshare platform names to our internal names
  const platformNameMap = {
    'facebook': 'facebook',
    'instagram': 'instagram',
    'x/twitter': 'twitter',
    'twitter': 'twitter',
    'linkedin': 'linkedin',
    'youtube': 'youtube',
    'tiktok': 'tiktok',
    'pinterest': 'pinterest',
    'bluesky': 'bluesky',
    'threads': 'threads',
    'google business': 'googleBusiness'
  };

  // Check if a platform is linked
  const isLinked = (platformKey) => {
    if (!connectedAccounts || connectedAccounts.length === 0) {
      return false;
    }

    const result = connectedAccounts.some(account => {
      // Handle both string array and object array formats
      const accountName = typeof account === 'string' ? account : account?.name;
      if (!accountName) return false;

      const normalized = accountName.toLowerCase();
      const mapped = platformNameMap[normalized] || normalized;
      return mapped === platformKey;
    });

    return result;
  };

  const socialNetworks = [
    { name: "threads", displayName: "Threads", icon: FaThreads, color: "#000000" },
    { name: "twitter", displayName: "Twitter", icon: SiX, color: "#000000" },
    { name: "googleBusiness", displayName: "Google Business", icon: FaGoogle, color: "#4285F4" },
    { name: "pinterest", displayName: "Pinterest", icon: FaPinterest, color: "#BD081C" },
    { name: "tiktok", displayName: "TikTok", icon: FaTiktok, color: "#000000" },
    { name: "instagram", displayName: "Instagram", icon: FaInstagram, color: "#E4405F" },
    { name: "bluesky", displayName: "BlueSky", icon: FaBluesky, color: "#1185FE" },
    { name: "youtube", displayName: "Youtube", icon: FaYoutube, color: "#FF0000" },
    { name: "linkedin", displayName: "LinkedIn", icon: FaLinkedinIn, color: "#0A66C2" },
    { name: "facebook", displayName: "Facebook", icon: FaFacebookF, color: "#1877F2" }
  ].map(network => ({
    ...network,
    linked: isLinked(network.name)
  }));

  const handleTextChange = (e) => {
    setPost({ ...post, text: e.target.value });
  };

  // Open media upload modal
  const handleOpenMediaModal = () => {
    setIsMediaModalOpen(true);
  };

  // Handle media confirmation from modal
  // Accepts { files: File[], urls: MediaUrlItem[] } from the tabbed MediaUploadModal
  // Backward compat: also accepts a plain File[] array (legacy)
  const handleMediaConfirm = async (result) => {
    // Backward compatibility: if result is an array, treat as files
    const files = Array.isArray(result) ? result : (result.files || []);
    const urls = Array.isArray(result) ? [] : (result.urls || []);

    if (files.length === 0 && urls.length === 0) return;

    setIsLoading(true);

    try {
      const currentFiles = Array.isArray(post.media) ? post.media : [];
      const currentPreviews = mediaPreviews || [];

      let newFilePreviews = [];
      let newUrlPreviews = [];

      // Process File objects (from Upload tab)
      if (files.length > 0) {
        // Validate video files
        const videoFiles = files.filter(f => f.type.startsWith('video/'));
        let allWarnings = [];

        for (const videoFile of videoFiles) {
          const validation = await validateVideoForPlatforms(videoFile);
          if (validation.warnings.length > 0) {
            allWarnings = [...allWarnings, ...validation.warnings];
          }
        }

        setMediaWarnings(allWarnings);

        if (allWarnings.length > 0) {
          const affectedPlatforms = [...new Set(allWarnings.map(w => w.platform))];
          toast({
            title: "Video may not work on some platforms",
            description: `Issues detected for: ${affectedPlatforms.join(', ')}. Check the warning below the media.`,
            status: "warning",
            duration: 5000,
            isClosable: true
          });
        }

        const baseIndex = currentPreviews.length;
        const previewPromises = files.map((file, index) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve({
                id: `${Date.now()}-${index}`,
                file,
                dataUrl: reader.result,
                type: file.type.split('/')[0],
                order: baseIndex + index
              });
            };
            reader.readAsDataURL(file);
          });
        });

        newFilePreviews = await Promise.all(previewPromises);
      }

      // Process URL-based media (from Recent/Library tabs)
      // These are already-uploaded URLs — they go into mediaPreviews with the HTTP URL as dataUrl
      // The submit logic already extracts HTTP URLs from mediaPreviews
      if (urls.length > 0) {
        const baseIndex = currentPreviews.length + newFilePreviews.length;
        newUrlPreviews = urls.map((item, index) => ({
          id: `url-${Date.now()}-${index}`,
          dataUrl: item.url, // HTTP URL — submit logic will pick this up
          type: item.type || 'image',
          order: baseIndex + index
        }));
      }

      // Merge everything
      const allFiles = [...currentFiles, ...files];
      const allPreviews = [...currentPreviews, ...newFilePreviews, ...newUrlPreviews];

      setPost({ ...post, media: allFiles });
      setMediaPreviews(allPreviews);
      setIsMediaModalOpen(false);

      const totalCount = allFiles.length + newUrlPreviews.length;
      toast({
        title: "Media added",
        description: `${totalCount} file(s) ready`,
        status: "success",
        duration: 2000,
        isClosable: true
      });
    } catch (error) {
      toast({
        title: "Error processing files",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Remove single media item
  const handleRemoveMedia = (mediaId) => {
    const mediaIndex = mediaPreviews.findIndex(p => p.id === mediaId);
    if (mediaIndex === -1) return;

    const newPreviews = mediaPreviews.filter(p => p.id !== mediaId);
    setMediaPreviews(newPreviews);
    setPost(prev => ({
      ...prev,
      media: prev.media.filter((_, idx) => idx !== mediaIndex)
    }));

    // Clear warnings if no videos left
    const hasVideosLeft = newPreviews.some(p => p.type === 'video');
    if (!hasVideosLeft) {
      setMediaWarnings([]);
    }
  };

  // Clear all media
  const handleClearAllMedia = () => {
    setPost({ ...post, media: [] });
    setMediaPreviews([]);
    setMediaWarnings([]);
  };

  const handleNetworkToggle = useCallback((networkName, isLinked) => {
    if (!isLinked) return; // Can't select unlinked networks
    setNetworks((prev) => ({
      ...prev,
      [networkName]: !prev[networkName]
    }));
  }, []);

  const [tempScheduledDate, setTempScheduledDate] = useState(null);

  const handleDateSelect = (date) => {
    setTempScheduledDate(date);
  };

  // Helper to get best time score for a given hour
  const getBestTimeScore = (hour) => {
    if (!bestTimes || bestTimes.length === 0) return 0;

    const selectedDay = tempScheduledDate ? tempScheduledDate.toLocaleDateString('en-US', { weekday: 'long' }) : null;

    // Find matching best time entries for this hour
    const matchingTimes = bestTimes.filter(bt => {
      const timeHour = parseInt(bt.time.split(':')[0]);
      const isPM = bt.time.includes('PM');
      const is12Hour = timeHour === 12;
      let hour24 = isPM ? (is12Hour ? 12 : timeHour + 12) : (is12Hour ? 0 : timeHour);

      // Check if this hour matches and day matches (if selected)
      return hour24 === hour && (!selectedDay || bt.day === selectedDay);
    });

    return matchingTimes.length > 0 ? matchingTimes[0].score : 0;
  };

  // Quick select a best time
  const handleQuickSelectBestTime = (bestTime) => {
    const timeHour = parseInt(bestTime.time.split(':')[0]);
    const isPM = bestTime.time.includes('PM');
    const is12Hour = timeHour === 12;
    let hour24 = isPM ? (is12Hour ? 12 : timeHour + 12) : (is12Hour ? 0 : timeHour);

    // Find the next occurrence of this day
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDayIndex = dayNames.indexOf(bestTime.day);
    const today = new Date();
    const currentDayIndex = today.getDay();

    let daysUntilTarget = targetDayIndex - currentDayIndex;
    if (daysUntilTarget <= 0) daysUntilTarget += 7; // Next week if today or past

    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntilTarget);
    targetDate.setHours(hour24, 0, 0, 0);

    setTempScheduledDate(targetDate);
  };

  const handleConfirmSchedule = async (selectedDate) => {
    const scheduleDate = selectedDate || tempScheduledDate;
    if (!scheduleDate || !user) return;

    // Clear autosave timer immediately to prevent "draft save failed" error after form reset
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    // IMPORTANT: When editing a scheduled post, ONLY update the state with new schedule time
    // The actual Ayrshare update will happen when user clicks "Save Changes" or "Mark Changes as Resolved"
    if (isEditingScheduledPost) {
      setTempScheduledDate(scheduleDate);
      setScheduledDate(scheduleDate); // Also update scheduledDate for display
      onClose();
      toast({
        title: "Schedule time updated",
        description: `New schedule: ${scheduleDate.toLocaleString()}. Click "Save Changes" to confirm.`,
        status: "info",
        duration: 3000,
        isClosable: true
      });
      return; // Don't send to API yet
    }

    setIsLoading(true);
    setTempScheduledDate(scheduleDate); // Update state for backward compatibility
    onClose();

    // Use JSON for requests without file uploads (better Vercel compatibility)
    const hasFileUpload = Array.isArray(post.media) && post.media.length > 0 && post.media[0] instanceof File;

    try {
      let response;

      if (hasFileUpload) {
        // Check if any file exceeds 4MB (Vercel limit) - upload directly to Supabase
        const VERCEL_LIMIT = 4 * 1024 * 1024; // 4MB
        const hasLargeFile = post.media.some(file => file.size > VERCEL_LIMIT);

        if (hasLargeFile) {
          // Upload all files directly to Supabase (bypasses Vercel limit)
          console.log('[handleConfirmSchedule] Large file detected, uploading directly to Supabase...');
          const uploadedUrls = [];

          for (let i = 0; i < post.media.length; i++) {
            const file = post.media[i];
            console.log(`[uploadMediaDirect] Uploading file ${i + 1}/${post.media.length}: ${file.name}`);

            const result = await uploadMediaDirect(file, user.id, activeWorkspace.id);
            if (!result.success) {
              throw new Error(`Failed to upload ${file.name}: ${result.error}`);
            }
            uploadedUrls.push(result.publicUrl);
            console.log('[uploadMediaDirect] Success:', result.publicUrl);
          }

          // Send URLs to API (not files)
          response = await fetch(`${baseURL}/api/post`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: post.text,
              userId: user.id,
              workspaceId: activeWorkspace.id,
              mediaUrl: uploadedUrls,
              networks: JSON.stringify(networks),
              scheduledDate: scheduleDate.toISOString(),
              postSettings: postSettings,
              ...(isEditingScheduledPost && currentDraftId && { postId: currentDraftId })
            })
          });
        } else {
          // Small files - use FormData (original flow)
          const formData = new FormData();
          formData.append("text", post.text);
          formData.append("userId", user.id);
          formData.append("workspaceId", activeWorkspace.id);

          // Append each file with 'media' field name (busboy will collect into array)
          post.media.forEach((file) => {
            formData.append("media", file);
          });

          formData.append("networks", JSON.stringify(networks));
          formData.append("scheduledDate", scheduleDate.toISOString());

          // Add post settings (Phase 4)
          formData.append("postSettings", JSON.stringify(postSettings));

          // If editing a scheduled post, include the postId
          if (isEditingScheduledPost && currentDraftId) {
            formData.append("postId", currentDraftId);
          }

          response = await fetch(`${baseURL}/api/post`, {
            method: "POST",
            body: formData
          });
        }
      } else {
        // Use JSON for text-only or URL media posts
        response = await fetch(`${baseURL}/api/post`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: post.text,
            userId: user.id,
            workspaceId: activeWorkspace.id,
            mediaUrl: mediaPreviews.length > 0 ? mediaPreviews.map(p => p.dataUrl).filter(url => url.startsWith('http')) : null,
            networks: JSON.stringify(networks),
            scheduledDate: scheduleDate.toISOString(),
            postSettings: postSettings, // Phase 4
            // If editing a scheduled post, include the postId
            ...(isEditingScheduledPost && currentDraftId && { postId: currentDraftId })
          })
        });
      }

      if (response.ok) {
        // Delete draft if this was loaded from a draft (but not if editing a scheduled post)
        if (currentDraftId && !isEditingScheduledPost) {
          try {
            await supabase
              .from("post_drafts")
              .delete()
              .eq("id", currentDraftId)
              .eq("workspace_id", activeWorkspace.id);
          } catch (error) {
            console.error("Error deleting draft:", error);
          }
        }

        toast({
          title: isEditingScheduledPost ? "Post updated!" : "Post scheduled!",
          description: isEditingScheduledPost
            ? "Your changes have been saved and the post is awaiting approval"
            : `Your post will be published on ${scheduleDate.toLocaleString()}`,
          status: "success",
          duration: 4000,
          isClosable: true
        });

        // Invalidate cache so Schedule page shows the new post immediately
        invalidatePosts(activeWorkspace?.id);

        // IMPORTANT: Clear currentDraftId BEFORE resetting form to prevent autosave errors
        setCurrentDraftId(null);

        // Reset form completely
        setPost({ text: "", media: [] });
        setNetworks({
          threads: false,
              twitter: false,
          googleBusiness: false,
          pinterest: false,
          tiktok: false,
              instagram: false,
          bluesky: false,
          youtube: false,
          linkedin: false,
          facebook: false,
            });
        setMediaPreviews([]);
        setScheduledDate(null);
        setTempScheduledDate(null);
        setLastSaved(null);
        setIsEditingScheduledPost(false);
      } else {
        const errorData = await response.json().catch(() => ({}));

        // More specific error messages
        let errorMessage = errorData.error || "Failed to schedule post";

        if (errorData.code === 'SUBSCRIPTION_REQUIRED') {
          errorMessage = "Please subscribe to schedule posts.";
        } else if (errorData.error && errorData.error.includes('No social media accounts')) {
          errorMessage = "Please connect your social media accounts before scheduling posts.";
        } else if (errorData.error && errorData.error.includes('upload media')) {
          errorMessage = errorData.error || "Failed to upload your media file. Please try again.";
        }

        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Error scheduling post:", error);
      // Determine error title based on error content
      let title = "Scheduling Failed";
      if (error.message.includes("No social media accounts") || error.message.includes("connect your accounts")) {
        title = "No Social Accounts";
      } else if (error.message.includes("subscribe") || error.message.includes("Subscription")) {
        title = "Subscription Required";
      }
      toast({
        title,
        description: error.message || "Unable to schedule your post. Please try again.",
        status: "error",
        duration: 5000,
        isClosable: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSchedule = () => {
    // When editing a scheduled post, don't clear the dates - the post already has a schedule
    if (!isEditingScheduledPost) {
      setTempScheduledDate(null);
      setScheduledDate(null);
    }
    onClose();
  };

  const platformPreviewOptions = [
    { value: "instagram", label: "Instagram", icon: FaInstagram },
    { value: "facebook", label: "Facebook", icon: FaFacebookF },
    { value: "twitter", label: "Twitter/X", icon: SiX },
    { value: "linkedin", label: "LinkedIn", icon: FaLinkedinIn },
    { value: "threads", label: "Threads", icon: FaThreads },
    { value: "tiktok", label: "TikTok", icon: FaTiktok }
  ];

  const renderPlatformPreview = () => {
    const hasContent = post.text || mediaPreviews.length > 0;

    if (!hasContent) {
      return (
        <p className="preview-placeholder">
          Your post preview will appear here
        </p>
      );
    }

    switch (selectedPreviewPlatform) {
      case "instagram":
        return (
          <InstagramPreview
            post={post}
            mediaPreviews={mediaPreviews}
            accountInfo={getAccountInfo('instagram')}
          />
        );

      case "facebook":
        return (
          <FacebookPreview
            post={post}
            mediaPreviews={mediaPreviews}
            accountInfo={getAccountInfo('facebook')}
          />
        );

      case "twitter":
        return (
          <TwitterPreview
            post={post}
            mediaPreviews={mediaPreviews}
            accountInfo={getAccountInfo('twitter')}
          />
        );

      case "linkedin":
        return (
          <LinkedInPreview
            post={post}
            mediaPreviews={mediaPreviews}
            accountInfo={getAccountInfo('linkedin')}
          />
        );

      case "threads":
        return (
          <ThreadsPreview
            post={post}
            mediaPreviews={mediaPreviews}
            accountInfo={getAccountInfo('threads')}
          />
        );

      case "tiktok":
        return (
          <TikTokPreview
            post={post}
            mediaPreviews={mediaPreviews}
            accountInfo={getAccountInfo('tiktok')}
          />
        );

      default:
        return null;
    }
  };

  const handleGenerateHashtags = async () => {
    if (!post.text || post.text.trim().length === 0) {
      toast({
        title: "No content",
        description: "Please write some text first to generate hashtags.",
        status: "warning",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    setIsGeneratingHashtags(true);

    try {
      // Get selected platform for platform-specific hashtags
      const selectedPlatform = Object.keys(networks).find(key => networks[key]);

      const response = await fetch(`${baseURL}/api/hashtag-research`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          topic: post.text.substring(0, 200), // Use first 200 chars as topic
          platform: selectedPlatform || null,
          count: 5
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate hashtags");
      }

      const json = await response.json();
      const data = json.data || json;

      if (data.hashtags && data.hashtags.length > 0) {
        // Append hashtags to the end of the post text
        const hashtagsText = '\n\n' + data.hashtags.map(h => h.display || `#${h.tag}`).join(' ');
        setPost({ ...post, text: post.text + hashtagsText });

        toast({
          title: "Hashtags generated",
          description: `Added ${data.hashtags.length} ${selectedPlatform ? selectedPlatform + ' ' : ''}hashtags to your post.`,
          status: "success",
          duration: 3000,
          isClosable: true
        });
      }
    } catch (error) {
      console.error("Error generating hashtags:", error);
      toast({
        title: "Error",
        description: "Failed to generate hashtags. Please try again.",
        status: "error",
        duration: 3000,
        isClosable: true
      });
    } finally {
      setIsGeneratingHashtags(false);
    }
  };

  const handleShortenLink = async () => {
    if (!urlToShorten || !urlToShorten.trim()) {
      toast({
        title: "No URL",
        description: "Please enter a URL to shorten.",
        status: "warning",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    // Basic URL validation
    try {
      new URL(urlToShorten);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL (e.g., https://example.com)",
        status: "error",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    setIsShorteningLink(true);

    try {
      const response = await fetch(`${baseURL}/api/links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          url: urlToShorten
        })
      });

      if (!response.ok) {
        throw new Error("Failed to create short link");
      }

      const data = await response.json();

      setShortenedLink(data);

      toast({
        title: "Link shortened",
        description: "Your trackable link is ready!",
        status: "success",
        duration: 3000,
        isClosable: true
      });
    } catch (error) {
      console.error("Error shortening link:", error);
      toast({
        title: "Error",
        description: "Failed to shorten link. Please try again.",
        status: "error",
        duration: 3000,
        isClosable: true
      });
    } finally {
      setIsShorteningLink(false);
    }
  };

  const handleCopyShortLink = () => {
    if (shortenedLink?.shortLink) {
      navigator.clipboard.writeText(shortenedLink.shortLink);
      toast({
        title: "Copied!",
        description: "Short link copied to clipboard",
        status: "success",
        duration: 2000,
        isClosable: true
      });
    }
  };

  // Handler for saving changes to scheduled post
  const handleSaveScheduledPost = async () => {
    if (!currentDraftId || !activeWorkspace?.id) {
      toast({
        title: "Error",
        description: "Post ID or workspace not found",
        status: "error",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    // Validate required fields
    const selectedPlatforms = Object.keys(networks).filter(k => networks[k]);
    if (!post.text || selectedPlatforms.length === 0) {
      toast({
        title: "Missing required fields",
        description: "Please add caption and select at least one platform",
        status: "warning",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    const finalScheduledDate = scheduledDate || tempScheduledDate;
    if (!finalScheduledDate) {
      toast({
        title: "Missing schedule date",
        description: "Please select a date and time",
        status: "warning",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    setIsLoading(true);
    setPostingProgress({ step: 'saving', percent: 10, estimatedTime: 10 });

    try {
      // Upload media if needed
      let uploadedUrls = mediaPreviews
        .map(p => p.dataUrl)
        .filter(url => url && url.startsWith('http'));

      // Handle file uploads
      const hasNewFiles = Array.isArray(post.media) && post.media.length > 0 && post.media[0] instanceof File;
      if (hasNewFiles) {
        setPostingProgress({ step: 'uploading', percent: 30, estimatedTime: 8 });

        const MAX_VERCEL_SIZE = 4 * 1024 * 1024; // 4MB
        const largeFiles = post.media.filter(f => f instanceof File && f.size > MAX_VERCEL_SIZE);
        const smallFiles = post.media.filter(f => f instanceof File && f.size <= MAX_VERCEL_SIZE);

        // Upload large files directly
        if (largeFiles.length > 0) {
          for (const file of largeFiles) {
            const result = await uploadMediaDirect(file, user.id, activeWorkspace.id);
            if (result.success && result.publicUrl) {
              uploadedUrls.push(result.publicUrl);
            }
          }
        }

        // Upload small files via API
        if (smallFiles.length > 0) {
          const formData = new FormData();
          formData.append("workspaceId", activeWorkspace.id);
          formData.append("userId", user.id);
          smallFiles.forEach((file) => {
            formData.append("media", file);
          });

          const uploadRes = await fetch(`${baseURL}/api/drafts/upload-media`, {
            method: "POST",
            body: formData
          });

          if (uploadRes.ok) {
            const uploadJson = await uploadRes.json();
            uploadedUrls = [...uploadedUrls, ...(uploadJson.urls || [])];
          }
        }
      }

      // Update the post
      setPostingProgress({ step: 'updating', percent: 60, estimatedTime: 5 });

      // IMPORTANT: If post is pending approval, ONLY update database, don't touch Ayrshare
      // Posts pending approval haven't been sent to Ayrshare yet (no ayr_post_id)
      if (approvalStatus === 'pending' || approvalStatus === 'changes_requested') {
        console.log('[Save] Post is pending approval, updating database only (not Ayrshare)');

        // Update directly in Supabase
        const { error } = await supabase
          .from('posts')
          .update({
            caption: post.text,
            media_urls: uploadedUrls,
            platforms: selectedPlatforms,
            scheduled_at: finalScheduledDate.toISOString(),
            post_settings: postSettings,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentDraftId)
          .eq('workspace_id', activeWorkspace.id);

        if (error) {
          console.error('[Save] Database update error:', error);
          throw new Error(error.message || 'Failed to update post in database');
        }
      } else {
        // Post is already scheduled/posted to Ayrshare - use update-scheduled endpoint
        console.log('[Save] Post is scheduled, updating via update-scheduled endpoint');

        const response = await fetch(`${baseURL}/api/post/update-scheduled`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            postId: currentDraftId,
            workspaceId: activeWorkspace.id,
            caption: post.text,
            mediaUrls: uploadedUrls,
            platforms: selectedPlatforms,
            scheduledDate: finalScheduledDate.toISOString(),
            postSettings: postSettings
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update post');
        }
      }

      setPostingProgress({ step: 'complete', percent: 100, estimatedTime: 0 });

      toast({
        title: "Post updated successfully!",
        description: `Your post has been updated and will be published on ${finalScheduledDate.toLocaleString()}`,
        status: "success",
        duration: 5000,
        isClosable: true
      });

      // Clear autosave timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      // Reset form completely
      setCurrentDraftId(null);
      setPost({ text: "", media: [] });
      setNetworks({
        threads: false, twitter: false, googleBusiness: false,
        pinterest: false, tiktok: false, instagram: false,
        bluesky: false, youtube: false, linkedin: false, facebook: false
      });
      setMediaPreviews([]);
      setScheduledDate(null);
      setTempScheduledDate(null);
      setLastSaved(null);
      setIsEditingScheduledPost(false);

      // Invalidate cache and navigate
      invalidatePosts(activeWorkspace?.id);
      navigate('/schedule');

    } catch (error) {
      console.error('Error updating scheduled post:', error);

      setPostingProgress({ step: 'idle', percent: 0, estimatedTime: 0 });

      toast({
        title: "Failed to update post",
        description: error.message || "An error occurred while updating the post",
        status: "error",
        duration: 5000,
        isClosable: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handler for marking changes as resolved
  const handleMarkResolved = async () => {
    if (!currentDraftId || !activeWorkspace?.id || !user?.id) {
      toast({
        title: "Error",
        description: "Missing required information",
        status: "error",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    // Validate required fields
    const selectedPlatforms = Object.keys(networks).filter(k => networks[k]);
    if (!post.text || selectedPlatforms.length === 0) {
      toast({
        title: "Missing required fields",
        description: "Please add caption and select at least one platform",
        status: "warning",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    const finalScheduledDate = scheduledDate || tempScheduledDate;
    if (!finalScheduledDate) {
      toast({
        title: "Missing schedule date",
        description: "Please select a date and time",
        status: "warning",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    setIsLoading(true);
    setPostingProgress({ step: 'saving', percent: 10, estimatedTime: 10 });

    try {
      // Step 1: Save the changes (same logic as handleSaveScheduledPost)
      let uploadedUrls = mediaPreviews
        .map(p => p.dataUrl)
        .filter(url => url && url.startsWith('http'));

      // Handle file uploads
      const hasNewFiles = Array.isArray(post.media) && post.media.length > 0 && post.media[0] instanceof File;
      if (hasNewFiles) {
        setPostingProgress({ step: 'uploading', percent: 30, estimatedTime: 8 });

        const MAX_VERCEL_SIZE = 4 * 1024 * 1024; // 4MB
        const largeFiles = post.media.filter(f => f instanceof File && f.size > MAX_VERCEL_SIZE);
        const smallFiles = post.media.filter(f => f instanceof File && f.size <= MAX_VERCEL_SIZE);

        // Upload large files directly
        if (largeFiles.length > 0) {
          for (const file of largeFiles) {
            const result = await uploadMediaDirect(file, user.id, activeWorkspace.id);
            if (result.success && result.publicUrl) {
              uploadedUrls.push(result.publicUrl);
            }
          }
        }

        // Upload small files via API
        if (smallFiles.length > 0) {
          const formData = new FormData();
          formData.append("workspaceId", activeWorkspace.id);
          formData.append("userId", user.id);
          smallFiles.forEach((file) => {
            formData.append("media", file);
          });

          const uploadRes = await fetch(`${baseURL}/api/drafts/upload-media`, {
            method: "POST",
            body: formData
          });

          if (uploadRes.ok) {
            const uploadJson = await uploadRes.json();
            uploadedUrls = [...uploadedUrls, ...(uploadJson.urls || [])];
          }
        }
      }

      // Update the post - ALWAYS use database update for mark resolved
      // Posts with changes_requested are always pending approval (not in Ayrshare yet)
      setPostingProgress({ step: 'updating', percent: 50, estimatedTime: 5 });

      console.log('[Mark Resolved] Updating database only (post pending approval)');

      const { error: updateError } = await supabase
        .from('posts')
        .update({
          caption: post.text,
          media_urls: uploadedUrls,
          platforms: selectedPlatforms,
          scheduled_at: finalScheduledDate.toISOString(),
          post_settings: postSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentDraftId)
        .eq('workspace_id', activeWorkspace.id);

      if (updateError) {
        console.error('[Mark Resolved] Database update error:', updateError);
        throw new Error(updateError.message || 'Failed to update post in database');
      }

      // Step 2: Mark as resolved
      setPostingProgress({ step: 'resolving', percent: 80, estimatedTime: 2 });

      const approveResponse = await fetch(`${baseURL}/api/post/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: currentDraftId,
          workspaceId: activeWorkspace.id,
          userId: user.id,
          action: 'mark_resolved',
          comment: 'Changes have been addressed and post is ready for re-approval'
        })
      });

      if (!approveResponse.ok) {
        const errorData = await approveResponse.json();
        throw new Error(errorData.error || 'Failed to mark as resolved');
      }

      setPostingProgress({ step: 'complete', percent: 100, estimatedTime: 0 });

      toast({
        title: "Changes saved and marked as resolved",
        description: "This post has been sent back for approval",
        status: "success",
        duration: 4000,
        isClosable: true
      });

      // Clear autosave timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      // Reset form completely
      setCurrentDraftId(null);
      setPost({ text: "", media: [] });
      setNetworks({
        threads: false, twitter: false, googleBusiness: false,
        pinterest: false, tiktok: false, instagram: false,
        bluesky: false, youtube: false, linkedin: false, facebook: false
      });
      setMediaPreviews([]);
      setScheduledDate(null);
      setTempScheduledDate(null);
      setLastSaved(null);
      setIsEditingScheduledPost(false);

      // Invalidate cache and navigate
      invalidatePosts(activeWorkspace?.id);
      navigate('/schedule');

    } catch (error) {
      console.error('Error marking as resolved:', error);

      setPostingProgress({ step: 'idle', percent: 0, estimatedTime: 0 });

      toast({
        title: "Failed to mark as resolved",
        description: error.message,
        status: "error",
        duration: 4000,
        isClosable: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to post.",
        status: "error",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    setIsLoading(true);

    // Calculate estimated time based on media and platforms
    const mediaCount = post.media?.length || 0;
    const platformCount = Object.values(networks).filter(Boolean).length;
    const estimatedTotal = 3 + (mediaCount * 3) + (platformCount * 2);

    // Start progress tracking
    setPostingProgress({ step: 'uploading', percent: 10, estimatedTime: estimatedTotal });

    // Use JSON for requests without file uploads (better Vercel compatibility)
    const hasFileUpload = Array.isArray(post.media) && post.media.length > 0 && post.media[0] instanceof File;
    let scheduledTime = null;

    if (scheduledDate) {
      // Ensure the scheduled date is in the future
      const now = new Date();
      scheduledTime = new Date(scheduledDate);

      if (scheduledTime <= now) {
        toast({
          title: "Invalid schedule time",
          description: "Please select a time in the future.",
          status: "error",
          duration: 3000,
          isClosable: true
        });
        setIsLoading(false);
        return;
      }
    }

    try {
      let response;

      if (hasFileUpload) {
        // Check if any file exceeds 4MB (Vercel limit) - upload directly to Supabase
        const VERCEL_LIMIT = 4 * 1024 * 1024; // 4MB
        const hasLargeFile = post.media.some(file => file.size > VERCEL_LIMIT);

        if (hasLargeFile) {
          // Upload all files directly to Supabase (bypasses Vercel limit)
          console.log('[handleSubmit] Large file detected, uploading directly to Supabase...');
          const uploadedUrls = [];

          for (let i = 0; i < post.media.length; i++) {
            const file = post.media[i];
            setPostingProgress(prev => ({
              ...prev,
              step: 'uploading',
              percent: Math.round(10 + (i / post.media.length) * 40),
              estimatedTime: Math.max(1, prev.estimatedTime - 1)
            }));

            const result = await uploadMediaDirect(file, user.id, activeWorkspace.id);
            if (!result.success) {
              throw new Error(`Failed to upload ${file.name}: ${result.error}`);
            }
            uploadedUrls.push(result.publicUrl);
          }

          // Update progress to publishing
          setPostingProgress(prev => ({ ...prev, step: 'publishing', percent: 60, estimatedTime: Math.ceil(prev.estimatedTime * 0.4) }));

          // Send URLs to API (not files)
          response = await fetch(`${baseURL}/api/post`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: post.text,
              userId: user.id,
              workspaceId: activeWorkspace.id,
              mediaUrl: uploadedUrls,
              networks: JSON.stringify(networks),
              scheduledDate: scheduledTime ? scheduledTime.toISOString() : null,
              postSettings: postSettings,
              ...(isEditingScheduledPost && currentDraftId && { postId: currentDraftId })
            })
          });
        } else {
          // Small files - use FormData (original flow)
          const formData = new FormData();
          formData.append("text", post.text);
          formData.append("userId", user.id);
          formData.append("workspaceId", activeWorkspace.id);

          // Append each file with 'media' field name (busboy will collect into array)
          post.media.forEach((file) => {
            formData.append("media", file);
          });

          formData.append("networks", JSON.stringify(networks));
          if (scheduledTime) {
            formData.append("scheduledDate", scheduledTime.toISOString());
          }

          // Add post settings (Phase 4)
          formData.append("postSettings", JSON.stringify(postSettings));

          // If editing a scheduled post, include the postId
          if (isEditingScheduledPost && currentDraftId) {
            formData.append("postId", currentDraftId);
          }

          // Update progress to publishing
          setPostingProgress(prev => ({ ...prev, step: 'publishing', percent: 50, estimatedTime: Math.ceil(prev.estimatedTime * 0.5) }));

          response = await fetch(`${baseURL}/api/post`, {
            method: "POST",
            body: formData
          });
        }
      } else {
        // Use JSON for text-only or URL media posts
        const mediaUrl = mediaPreviews.length > 0 ? mediaPreviews.map(p => p.dataUrl).filter(url => url.startsWith('http')) : null;

        // Update progress to publishing
        setPostingProgress(prev => ({ ...prev, step: 'publishing', percent: 50, estimatedTime: Math.ceil(prev.estimatedTime * 0.5) }));

        response = await fetch(`${baseURL}/api/post`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: post.text,
            userId: user.id,
            workspaceId: activeWorkspace.id,
            mediaUrl,
            networks: JSON.stringify(networks),
            scheduledDate: scheduledTime ? scheduledTime.toISOString() : null,
            postSettings: postSettings, // Phase 4
            // If editing a scheduled post, include the postId
            ...(isEditingScheduledPost && currentDraftId && { postId: currentDraftId })
          })
        });
      }

      if (response.ok) {
        const responseData = await response.json().catch(() => ({}));
        const isPendingApproval = responseData.status === 'pending_approval';

        // Delete draft after successful posting (but not if editing a scheduled post)
        if (currentDraftId && !isEditingScheduledPost) {
          try {
            await fetch(`${baseURL}/api/drafts/delete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspaceId: activeWorkspace.id,
                userId: user.id,
                draftId: currentDraftId
              })
            });
          } catch (error) {
            console.error("Error deleting draft:", error);
          }
        }

        // Show appropriate message based on whether approval is needed
        if (isPendingApproval) {
          toast({
            title: isEditingScheduledPost ? "Post updated!" : "Post awaiting approval",
            description: isEditingScheduledPost
              ? "Your changes have been saved and the post is awaiting approval"
              : `Your post has been saved and is waiting for client approval before being scheduled for ${scheduledDate.toLocaleString()}.`,
            status: "info",
            duration: 5000,
            isClosable: true
          });
        } else {
          toast({
            title: isEditingScheduledPost ? "Post updated!" : (scheduledDate ? "Post scheduled." : "Post submitted."),
            description: isEditingScheduledPost
              ? "Your changes have been saved successfully"
              : (scheduledDate
                ? `Your post was scheduled for ${scheduledDate.toLocaleString()}.`
                : "Your post was successfully submitted."),
            status: "success",
            duration: 3000,
            isClosable: true
          });
        }
        // Mark progress as complete
        setPostingProgress({ step: 'complete', percent: 100, estimatedTime: 0 });
        // Clear auto-save timer to prevent "draft save failed" error after success
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        // IMPORTANT: Clear currentDraftId BEFORE resetting form to prevent autosave errors
        setCurrentDraftId(null);
        // Reset form completely
        setPost({ text: "", media: [] });
        setNetworks({
          threads: false,
              twitter: false,
          googleBusiness: false,
          pinterest: false,
          tiktok: false,
              instagram: false,
          bluesky: false,
          youtube: false,
          linkedin: false,
          facebook: false,
            });
        setMediaPreviews([]);
        setScheduledDate(null);
        setLastSaved(null);
        setIsEditingScheduledPost(false);
      } else {
        const errorData = await response.json().catch(() => ({}));

        // More specific error messages based on error codes
        let errorMessage = errorData.error || "Failed to submit post";
        let errorTitle = "An error occurred";

        if (errorData.code === 'SUBSCRIPTION_REQUIRED') {
          errorTitle = "Subscription Required";
          errorMessage = "Please subscribe to post to social media platforms.";
        } else if (errorData.code === 'CONFIG_ERROR') {
          errorTitle = "Configuration Error";
          errorMessage = errorData.error || "Social media service is not properly configured. Please contact support.";
        } else if (errorData.code === 'VALIDATION_ERROR') {
          errorTitle = "Validation Error";
          errorMessage = errorData.error || "Please check your post content and try again.";
        } else if (errorData.error && errorData.error.includes('No social media accounts')) {
          errorTitle = "No Social Accounts";
          errorMessage = "Please connect your social media accounts in the Social Accounts tab before posting.";
        } else if (errorData.error && errorData.error.includes('upload media')) {
          errorTitle = "Media Upload Failed";
          errorMessage = errorData.error || "Failed to upload your media file. Please try again.";
        } else if (errorData.code === 'EXTERNAL_API_ERROR') {
          errorTitle = "Posting Failed";
          errorMessage = errorData.error || "Failed to post to social media. Please try again.";
        }

        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Error submitting post:", error);
      // Determine error title based on error content
      let title = "Posting Failed";
      if (error.message.includes("No social media accounts") || error.message.includes("connect your accounts")) {
        title = "No Social Accounts";
      } else if (error.message.includes("subscribe") || error.message.includes("Subscription")) {
        title = "Subscription Required";
      }
      toast({
        title,
        description: error.message || "Unable to submit your post. Please try again.",
        status: "error",
        duration: 5000,
        isClosable: true
      });
    } finally {
      setIsLoading(false);
      // Reset progress after a short delay to show completion
      setTimeout(() => {
        setPostingProgress({ step: '', percent: 0, estimatedTime: 0 });
      }, 500);
    }
  };

  // AI Post Generation
  const handleGenerateWithAI = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to use AI generation",
        status: "error",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    setIsGenerating(true);
    try {
      const selectedPlatforms = Object.keys(networks).filter(key => networks[key]);

      const response = await fetch(`${baseURL}/api/generate-post`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          userId: user?.id,
          prompt: aiPrompt,
          platforms: selectedPlatforms,
          websiteUrl: aiWebsiteUrl || null
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate post");
      }

      const data = await response.json();
      setAiVariations(data.variations || []);

      // Show helpful tips based on what was used
      if (data.websiteUsed) {
        toast({
          title: "Website analyzed",
          description: `Content from "${data.websiteTitle || 'website'}" was used to generate posts`,
          status: "success",
          duration: 3000,
          isClosable: true
        });
      } else if (!data.brandProfileUsed) {
        toast({
          title: "Tip",
          description: "Complete your Brand Profile for better AI suggestions!",
          status: "info",
          duration: 4000,
          isClosable: true
        });
      }
    } catch (error) {
      console.error("Error generating post:", error);
      toast({
        title: "Error generating post",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectVariation = (variation) => {
    // Clean up variation text (remove numbering if present)
    const cleanText = variation.replace(/^\d+\.\s*/, '').replace(/^\*\*Variation\s+\d+:?\*\*\s*/i, '').trim();
    setPost({ ...post, text: cleanText });
    onAiClose();
    setAiPrompt("");
    setAiWebsiteUrl("");
    setAiVariations([]);
  };

  // Calculate best posting time based on real analytics or selected platforms
  const getBestPostingTime = () => {
    // If we have real analytics data, use it
    if (hasRealData) {
      return bestPostingTime;
    }

    // Otherwise, fall back to platform-specific optimal times
    const selectedPlatformNames = Object.keys(networks).filter(key => networks[key]);

    // Platform-specific optimal times (industry averages)
    const platformTimes = {
      instagram: "11:00 AM - 1:00 PM",
      facebook: "1:00 PM - 3:00 PM",
      twitter: "12:00 PM - 1:00 PM",
      linkedin: "10:00 AM - 12:00 PM",
      tiktok: "6:00 PM - 9:00 PM",
      youtube: "2:00 PM - 4:00 PM",
      pinterest: "8:00 PM - 11:00 PM",
      threads: "12:00 PM - 1:00 PM"
    };

    if (selectedPlatformNames.length === 0) {
      return "2:00 PM";
    }

    // Return the time for the first selected platform
    const firstPlatform = selectedPlatformNames[0];
    return platformTimes[firstPlatform] || "2:00 PM";
  };

  // Get hashtag count from post text
  const getHashtagCount = () => {
    const text = post.text || "";
    const hashtags = text.match(/#\w+/g) || [];
    return hashtags.length;
  };

  // Get color based on engagement score
  const getScoreColor = () => {
    if (engagementScore >= 80) return "#10b981"; // Green
    if (engagementScore >= 60) return "#f59e0b"; // Orange
    if (engagementScore >= 40) return "#f97316"; // Dark orange
    return "#ef4444"; // Red
  };

  // Calculate stroke offset for circular progress
  const getStrokeOffset = () => {
    const circumference = 2 * Math.PI * 50;
    return circumference - (engagementScore / 100) * circumference;
  };

  // Generate dynamic improvement suggestions based on score breakdown
  const getImprovementSuggestions = () => {
    if (!scoreBreakdown) return [];
    const suggestions = [];
    const b = scoreBreakdown;

    // Media - biggest impact (20 pts)
    if (b.media.score === 0) {
      suggestions.push({ icon: '📸', text: 'Add an image or video to boost engagement by up to 150%', impact: 20, category: 'Media' });
    } else if (b.media.score < 20) {
      suggestions.push({ icon: '🎬', text: 'Use video content for even higher engagement rates', impact: 2, category: 'Media' });
    }

    // Text length (18 pts)
    if (b.length.score < 12) {
      const platforms = b.length.selectedPlatforms;
      if (b.length.textLength < 50) {
        suggestions.push({ icon: '📝', text: 'Write more - aim for 80-150 characters for optimal engagement', impact: 18 - b.length.score, category: 'Length' });
      } else if (b.length.textLength > 200) {
        suggestions.push({ icon: '✂️', text: 'Shorten your text - concise posts get more engagement', impact: 18 - b.length.score, category: 'Length' });
      } else {
        suggestions.push({ icon: '📝', text: `Adjust text length to match ${platforms.length > 0 ? platforms[0] : 'platform'} best practices`, impact: 18 - b.length.score, category: 'Length' });
      }
    }

    // Engagement hooks (15 pts)
    if (b.hooks.score < 10) {
      if (!b.hooks.hasQuestion) {
        suggestions.push({ icon: '❓', text: 'Ask a question to drive 2x more comments', impact: 5, category: 'Hooks' });
      }
      if (!b.hooks.hasCTA) {
        suggestions.push({ icon: '👆', text: 'Add a call-to-action (e.g. "Share your thoughts", "Tag a friend")', impact: 5, category: 'Hooks' });
      }
      if (!b.hooks.hasUrgency) {
        suggestions.push({ icon: '⏰', text: 'Create urgency with words like "today", "limited", or "don\'t miss"', impact: 3, category: 'Hooks' });
      }
    }

    // Hashtags (12 pts)
    if (b.hashtags.score < 10) {
      if (b.hashtags.count === 0) {
        suggestions.push({ icon: '#️⃣', text: 'Add 2-5 relevant hashtags to increase discoverability', impact: 12, category: 'Hashtags' });
      } else if (b.hashtags.count === 1) {
        suggestions.push({ icon: '#️⃣', text: 'Add a few more hashtags (2-5 is the sweet spot)', impact: 4, category: 'Hashtags' });
      } else if (b.hashtags.count > 10) {
        suggestions.push({ icon: '#️⃣', text: 'Reduce hashtags - too many looks spammy (aim for 2-5)', impact: 7, category: 'Hashtags' });
      }
    }

    // First line hook (12 pts)
    if (b.firstLine.score < 8) {
      if (!b.firstLine.hasPowerWords) {
        suggestions.push({ icon: '🎯', text: 'Start with a hook word: "How", "Why", "Secret", "This", or "Here\'s"', impact: 4, category: 'Hook' });
      }
      if (!b.firstLine.hasFirstLinePunctuation) {
        suggestions.push({ icon: '❗', text: 'Add a question or exclamation to your opening line', impact: 3, category: 'Hook' });
      }
      if (b.firstLine.length < 20) {
        suggestions.push({ icon: '✍️', text: 'Make your first line longer and more attention-grabbing', impact: 3, category: 'Hook' });
      }
    }

    // Platform selection (10 pts)
    if (b.platforms.score < 10) {
      if (b.platforms.count === 0) {
        suggestions.push({ icon: '📱', text: 'Select platforms to post on (2-4 recommended)', impact: 10, category: 'Platforms' });
      } else if (b.platforms.count === 1) {
        suggestions.push({ icon: '📱', text: 'Cross-post to 2-4 platforms to maximize reach', impact: 3, category: 'Platforms' });
      } else if (b.platforms.count > 4) {
        suggestions.push({ icon: '📱', text: 'Focus on 2-4 platforms for better tailored content', impact: 5, category: 'Platforms' });
      }
    }

    // Emoji (8 pts)
    if (b.emoji.score < 8) {
      if (b.emoji.count === 0) {
        suggestions.push({ icon: '😊', text: 'Add 1-3 emojis to boost engagement by 25%+', impact: 8, category: 'Emoji' });
      } else if (b.emoji.count > 3) {
        suggestions.push({ icon: '😊', text: 'Use fewer emojis (1-3 is optimal, too many can reduce quality)', impact: 3, category: 'Emoji' });
      }
    }

    // URL (5 pts)
    if (b.url.score === 0) {
      suggestions.push({ icon: '🔗', text: 'Include a link for better click-through conversion', impact: 5, category: 'Link' });
    }

    // Sort by impact (highest first) and limit to top 5
    return suggestions.sort((a, c) => c.impact - a.impact).slice(0, 5);
  };

  return (
    <div className="compose-content">
      {/* Posting Progress Modal */}
      {isLoading && postingProgress.step && (
        <div className="posting-progress-overlay">
          <div className="posting-progress-modal">
            <div className="progress-spinner"></div>
            <p className="progress-step">
              {postingProgress.step === 'uploading' && 'Preparing your post...'}
              {postingProgress.step === 'publishing' && 'Publishing to platforms...'}
              {postingProgress.step === 'complete' && 'Complete!'}
            </p>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${postingProgress.percent}%` }}
              />
            </div>
            <p className="progress-time">
              {postingProgress.step === 'complete'
                ? 'Done!'
                : postingProgress.estimatedTime > 0
                  ? `~${postingProgress.estimatedTime}s remaining`
                  : 'Almost done...'}
            </p>
          </div>
        </div>
      )}

      {/* Subscription Banner */}
      {!canPost && (
        <SubscriptionGuard
          showBanner={true}
          showOverlay={false}
          message="Subscribe to start posting to your social media accounts"
        />
      )}

      {/* Top Row - Create Post and Socials */}
      <div className="compose-top-row">
        {/* Left - Create Post */}
        <div className="compose-left">
          <div className="compose-header">
            <h2 className="compose-title">Create a Post</h2>
            <p className="compose-subtitle">
              Create a high-performing post to get your message across.
            </p>
          </div>

          <div className="compose-form">
            <div className="textarea-container">
              <textarea
                value={post.text}
                onChange={handleTextChange}
                placeholder="What would you like to share?"
                className="compose-textarea"
              />
            </div>

            {/* Media preview thumbnails */}
            {mediaPreviews.length > 0 && (
              <div className="compose-media-preview-section">
                <div className="preview-header">
                  <span className="preview-label">
                    {mediaPreviews.length} {mediaPreviews.length === 1 ? 'file' : 'files'} attached
                  </span>
                  <button
                    className="btn-clear-all"
                    onClick={handleClearAllMedia}
                    type="button"
                  >
                    Clear all
                  </button>
                </div>

                <div className="media-thumbnails">
                  {mediaPreviews.map((media, index) => (
                    <div key={media.id} className="media-thumbnail-item">
                      <div className="thumbnail-preview">
                        {media.type === 'image' ? (
                          <img src={media.dataUrl} alt={`Media ${index + 1}`} />
                        ) : (
                          <video src={media.dataUrl} />
                        )}
                      </div>
                      <button
                        className="thumbnail-remove"
                        onClick={() => handleRemoveMedia(media.id)}
                        type="button"
                        aria-label={`Remove media ${index + 1}`}
                      >
                        ✕
                      </button>
                      <span className="thumbnail-order">{index + 1}</span>
                    </div>
                  ))}
                  <button
                    className="add-more-btn"
                    onClick={handleOpenMediaModal}
                    type="button"
                  >
                    <span style={{ fontSize: '24px' }}>+</span>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>Add more</span>
                  </button>
                </div>

                {/* Video validation warnings */}
                {mediaWarnings.length > 0 && (
                  <div className="media-warnings">
                    <div className="warning-header">
                      <span className="warning-icon">⚠️</span>
                      <span>Video may not work on these platforms:</span>
                    </div>
                    <ul className="warning-list">
                      {mediaWarnings.map((warning, idx) => (
                        <li key={idx} className="warning-item">
                          <strong style={{ textTransform: 'capitalize' }}>{warning.platform}:</strong>{' '}
                          {warning.issues.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="form-footer">
              <div className="form-actions">
                <button
                  className="media-upload-btn"
                  onClick={handleOpenMediaModal}
                  title="Add images/videos"
                  type="button"
                  style={{ position: 'relative' }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M21 19V5C21 3.9 20.1 3 19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19ZM8.5 13.5L11 16.51L14.5 12L19 18H5L8.5 13.5Z" fill="currentColor"/>
                  </svg>
                  {mediaPreviews.length > 0 && (
                    <span className="media-count-badge">{mediaPreviews.length}</span>
                  )}
                </button>
                <FeatureGate
                  feature="aiFeatures"
                  fallbackType="hide"
                  requiredTier="Pro"
                >
                  <button
                    className="media-upload-btn"
                    onClick={onAiOpen}
                    title="Generate with AI"
                    style={{ marginLeft: '8px' }}
                  >
                    AI
                  </button>
                </FeatureGate>
                <FeatureGate
                  feature="aiFeatures"
                  fallbackType="hide"
                  requiredTier="Pro"
                >
                  <button
                    className="media-upload-btn"
                    onClick={handleGenerateHashtags}
                    title="Generate Hashtags"
                    disabled={isGeneratingHashtags}
                    style={{ marginLeft: '8px' }}
                  >
                    {isGeneratingHashtags ? '...' : '#'}
                  </button>
                </FeatureGate>
                <button
                  className="media-upload-btn"
                  onClick={() => setShowLinkShortener(!showLinkShortener)}
                  title="Link Shortener"
                  style={{ marginLeft: '8px' }}
                >
                  🔗
                </button>
              </div>

              <div className="form-buttons">
                {lastSaved && (
                  <span style={{
                    fontSize: '12px',
                    color: 'rgba(0,0,0,0.5)',
                    marginRight: '10px'
                  }}>
                    Draft saved {new Date(lastSaved).toLocaleTimeString()}
                  </span>
                )}
                {isEditingScheduledPost ? (
                  // When editing a scheduled post - show Re-schedule and ONE action button
                  <>
                    {/* Left side: Re-schedule Post button */}
                    <button
                      className="btn-schedule"
                      onClick={onOpen}
                      disabled={!canPost}
                      style={{
                        opacity: !canPost ? 0.5 : 1,
                        cursor: !canPost ? 'not-allowed' : 'pointer',
                        marginRight: '12px'
                      }}
                    >
                      Re-schedule Post
                    </button>

                    {/* Right side: ONE button that switches based on approval_status */}
                    {approvalStatus === 'changes_requested' ? (
                      <button
                        onClick={handleMarkResolved}
                        className="btn-mark-resolved"
                        disabled={isLoading}
                        style={{
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '12px 24px',
                          borderRadius: '8px',
                          fontWeight: '600',
                          border: 'none',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                          opacity: isLoading ? 0.5 : 1
                        }}
                      >
                        {isLoading ? "Saving..." : "✓ Mark Changes as Resolved"}
                      </button>
                    ) : (
                      <button
                        className="btn-schedule"
                        onClick={handleSaveScheduledPost}
                        disabled={isLoading || !canPost}
                        style={{
                          opacity: (!canPost || isLoading) ? 0.5 : 1,
                          cursor: (!canPost || isLoading) ? 'not-allowed' : 'pointer',
                          backgroundColor: '#10b981'
                        }}
                      >
                        {isLoading ? "Saving..." : "Save Changes"}
                      </button>
                    )}
                  </>
                ) : (
                  // When creating new post - show normal buttons
                  <>
                    <button
                      className="btn-schedule"
                      onClick={onOpen}
                      disabled={!canPost}
                      style={{ opacity: !canPost ? 0.5 : 1, cursor: !canPost ? 'not-allowed' : 'pointer' }}
                    >
                      Schedule Post
                    </button>
                    <button
                      className="btn-post"
                      onClick={handleSubmit}
                      disabled={isLoading || !canPost}
                      style={{ opacity: (!canPost || isLoading) ? 0.5 : 1, cursor: (!canPost || isLoading) ? 'not-allowed' : 'pointer' }}
                    >
                      {isLoading ? "Posting..." : "Post Now"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Link Shortener Section */}
            {showLinkShortener && (
              <div className="link-shortener-section" style={{
                marginTop: '20px',
                padding: '16px',
                backgroundColor: 'var(--bg-secondary, #F1F6F4)',
                borderRadius: '10px',
                border: '1px solid var(--border-color, rgba(0, 0, 0, 0.1))'
              }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary, #114C5A)' }}>
                  Link Shortener & Tracker
                </h4>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <input
                    type="url"
                    value={urlToShorten}
                    onChange={(e) => setUrlToShorten(e.target.value)}
                    placeholder="Enter URL to shorten (e.g., https://example.com)"
                    className="link-shortener-input"
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      border: '1px solid var(--border-color, rgba(0, 0, 0, 0.2))',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontFamily: 'Inter, sans-serif',
                      backgroundColor: 'var(--input-bg, #ffffff)',
                      color: 'var(--text-primary, #000000)'
                    }}
                  />
                  <button
                    onClick={handleShortenLink}
                    disabled={isShorteningLink || !urlToShorten}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#afabf9',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#000',
                      cursor: isShorteningLink || !urlToShorten ? 'not-allowed' : 'pointer',
                      opacity: isShorteningLink || !urlToShorten ? 0.5 : 1
                    }}
                  >
                    {isShorteningLink ? 'Shortening...' : 'Shorten'}
                  </button>
                </div>

                {shortenedLink && (
                  <div className="shortened-link-result" style={{
                    padding: '12px',
                    backgroundColor: 'var(--accent-bg-subtle, rgba(175, 171, 249, 0.1))',
                    borderRadius: '8px',
                    border: '1px solid #afabf9'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="text"
                        value={shortenedLink.shortLink}
                        readOnly
                        className="shortened-link-display"
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          backgroundColor: 'var(--input-bg, #ffffff)',
                          border: '1px solid var(--border-color, rgba(0, 0, 0, 0.1))',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontFamily: 'monospace',
                          color: 'var(--text-primary, #000000)'
                        }}
                      />
                      <button
                        onClick={handleCopyShortLink}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: 'var(--accent-dark, #114C5A)',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#ffffff',
                          cursor: 'pointer'
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'var(--text-tertiary, rgba(0, 0, 0, 0.6))' }}>
                      ✓ This link is trackable. View analytics in the Posts tab after using it.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Post Settings (Phase 4) */}
            <PostSettings
              selectedPlatforms={Object.keys(networks).filter(k => networks[k])}
              settings={postSettings}
              onSettingsChange={setPostSettings}
            />
          </div>
        </div>

        {/* Right - Social Media Selector */}
        <div className="compose-socials">
          <h3 className="socials-title">Socials</h3>
          <div className="socials-grid">
            {socialNetworks.map((network) => {
              const Icon = network.icon;
              const isSelected = networks[network.name];
              const isLinked = network.linked;

              return (
                <button
                  key={network.name}
                  className={`social-button ${isSelected && isLinked ? 'selected' : ''} ${!isLinked ? 'disabled' : ''}`}
                  onClick={() => handleNetworkToggle(network.name, isLinked)}
                  style={{
                    backgroundColor: isSelected && isLinked ? network.color : (isLinked ? '#f0f0f0' : '#d9d9d9'),
                    cursor: isLinked ? 'pointer' : 'not-allowed',
                    opacity: isLinked ? 1 : 0.5,
                    border: isLinked && !isSelected ? `2px solid ${network.color}` : '2px solid transparent'
                  }}
                >
                  <Icon
                    className="social-icon"
                    style={{
                      color: isSelected && isLinked ? 'white' : (isLinked ? network.color : 'rgba(0,0,0,0.5)')
                    }}
                  />
                  <span
                    className="social-name"
                    style={{
                      color: isSelected && isLinked ? 'white' : (isLinked ? network.color : 'rgba(0,0,0,0.5)')
                    }}
                  >
                    {network.displayName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Row - Preview and Comments */}
      <div className="compose-bottom-row">
        {/* Left - Preview */}
        <div className="compose-preview">
          <div className="preview-header-section">
            <h3 className="preview-title">Preview</h3>
            <select
              className="platform-selector"
              value={selectedPreviewPlatform}
              onChange={(e) => setSelectedPreviewPlatform(e.target.value)}
            >
              {platformPreviewOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="preview-container">
            {/* Instagram, Twitter, and Facebook have their own device mockups, skip wrapper */}
            {['instagram', 'twitter', 'facebook', 'linkedin', 'tiktok', 'threads'].includes(selectedPreviewPlatform) ? (
              renderPlatformPreview()
            ) : (
              <div className="phone-mockup">
                <div className="phone-notch">
                  <div className="notch-line" />
                  <div className="notch-line" />
                </div>

                <div className="phone-content">
                  {renderPlatformPreview()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right - Performance Prediction */}
        <FeatureGate
          feature="postPredictions"
          fallbackType="overlay"
          requiredTier="Pro"
          upgradeMessage="Post predictions and best time to post recommendations are available in Pro tier and higher."
        >
          <div className="compose-prediction">
            <div className="prediction-header-section">
              <h3 className="prediction-title">Performance Prediction</h3>
            </div>
            <div className="prediction-container">
              {/* Show Run Prediction Button when not yet run */}
              {!predictionRun ? (
                <div className="prediction-prompt">
                  <div className="prediction-prompt-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <p className="prediction-prompt-text">
                    Analyze your post content to get engagement predictions and optimization tips
                  </p>
                  <button
                    className="btn-run-prediction"
                    onClick={runPrediction}
                    disabled={isPredicting || (!post.text && mediaPreviews.length === 0)}
                  >
                    {isPredicting ? (
                      <>
                        <span className="prediction-spinner"></span>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="5 3 19 12 5 21 5 3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Run Prediction
                      </>
                    )}
                  </button>
                  {(!post.text && mediaPreviews.length === 0) && (
                    <p className="prediction-hint">Add some content first</p>
                  )}
                </div>
              ) : (
                <>
                  {/* Engagement Score Circle */}
                  <div className="engagement-score">
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="10"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke={getScoreColor()}
                        strokeWidth="10"
                        strokeDasharray="314"
                        strokeDashoffset={getStrokeOffset()}
                        transform="rotate(-90 60 60)"
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
                      />
                      <text
                        x="60"
                        y="70"
                        textAnchor="middle"
                        fontSize="36"
                        fontWeight="bold"
                        fill={getScoreColor()}
                      >
                        {engagementScore}
                      </text>
                    </svg>
                    <p className="score-label">Engagement Score</p>
                  </div>

                  {/* Re-run Button */}
                  <button
                    className="btn-rerun-prediction"
                    onClick={runPrediction}
                    disabled={isPredicting}
                  >
                    {isPredicting ? 'Analyzing...' : 'Re-analyze'}
                  </button>

                  {/* Data Source Indicator */}
                  <div className="data-source-indicator" style={{
                    padding: '8px 12px',
                    backgroundColor: hasRealData ? 'var(--success-bg, #d1fae5)' : 'var(--warning-bg, #fef3c7)',
                    borderRadius: '6px',
                    marginBottom: '12px',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span>{hasRealData ? '✓' : 'ℹ'}</span>
                    <span style={{ color: hasRealData ? 'var(--success-text, #065f46)' : 'var(--warning-text, #92400e)' }}>
                      {hasRealData
                        ? `Personalized data from your ${analyticsData?.summary?.totalPosts || 0} posts`
                        : 'Industry averages (post 10+ times for personalized insights)'}
                    </span>
                  </div>

                  {/* Timezone Indicator */}
                  {activeWorkspace?.timezone && (
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--text-tertiary, #6b7280)',
                      marginBottom: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <span>🌍</span>
                      <span>Times shown in: {activeWorkspace.timezone}</span>
                    </div>
                  )}

                  {/* Prediction Details */}
                  <div className="prediction-details">
                    <div className="prediction-item">
                      <span className="prediction-icon">🕐</span>
                      <div className="prediction-info">
                        <span className="prediction-label">Best time to post:</span>
                        <span className="prediction-value">{getBestPostingTime()}</span>
                      </div>
                    </div>

                    <div className="prediction-item">
                      <span className="prediction-icon">#</span>
                      <div className="prediction-info">
                        <span className="prediction-label">Hashtags:</span>
                        <span className="prediction-value">{getHashtagCount()} / 5</span>
                      </div>
                    </div>
                  </div>

                  {/* Improvement Suggestions */}
                  {scoreBreakdown && getImprovementSuggestions().length > 0 && (
                    <div className="improvement-suggestions">
                      <h4 className="suggestions-title">
                        💡 How to improve
                      </h4>
                      <div className="suggestions-list">
                        {getImprovementSuggestions().map((suggestion, idx) => (
                          <div key={idx} className="suggestion-item">
                            <span className="suggestion-icon">{suggestion.icon}</span>
                            <div className="suggestion-content">
                              <span className="suggestion-text">{suggestion.text}</span>
                              <span className="suggestion-impact">+{suggestion.impact} pts</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {engagementScore >= 80 && (
                        <div className="suggestion-perfect">
                          Your post is well-optimized! Keep up the great work.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Analytics Insights */}
                  {analyticsData?.summary && (
                <div className="analytics-insights">
                  <h4 style={{ margin: '16px 0 12px', fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary, #374151)' }}>
                    📊 Last 7 Days
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="analytics-stat-box" style={{
                      padding: '10px',
                      backgroundColor: 'var(--bg-tertiary, #f3f4f6)',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary, #111827)' }}>
                        {analyticsData.summary.totalPosts || 0}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary, #6b7280)' }}>Posts</div>
                    </div>
                    <div className="analytics-stat-box" style={{
                      padding: '10px',
                      backgroundColor: 'var(--bg-tertiary, #f3f4f6)',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary, #111827)' }}>
                        {analyticsData.summary.totalEngagements?.toLocaleString() || 0}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary, #6b7280)' }}>Engagements</div>
                    </div>
                    <div className="analytics-stat-box" style={{
                      padding: '10px',
                      backgroundColor: 'var(--bg-tertiary, #f3f4f6)',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary, #111827)' }}>
                        {analyticsData.summary.avgEngagement || 0}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary, #6b7280)' }}>Avg/Post</div>
                    </div>
                    <div className="analytics-stat-box" style={{
                      padding: '10px',
                      backgroundColor: analyticsData.summary.trendPercent >= 0 ? 'var(--success-bg, #d1fae5)' : 'var(--error-bg, #fee2e2)',
                      borderRadius: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{
                        fontSize: '20px',
                        fontWeight: '700',
                        color: analyticsData.summary.trendPercent >= 0 ? 'var(--success-text, #059669)' : 'var(--error-text, #dc2626)'
                      }}>
                        {analyticsData.summary.trendPercent >= 0 ? '+' : ''}{analyticsData.summary.trendPercent || 0}%
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary, #6b7280)' }}>Trend</div>
                    </div>
                  </div>

                  {/* Best Times List */}
                  {bestTimes.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{
                        fontSize: '12px',
                        color: 'var(--text-tertiary, #6b7280)',
                        marginBottom: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>Top posting times{hasRealData ? ' (your data)' : ' (industry avg)'}:</span>
                      </div>
                      {bestTimes.map((time, idx) => (
                        <div key={idx} className="best-time-item" style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          backgroundColor: idx === 0 ? 'var(--accent-bg, #ddd6fe)' : 'var(--bg-tertiary, #f3f4f6)',
                          borderRadius: '6px',
                          marginBottom: '4px',
                          fontSize: '12px'
                        }}>
                          <span style={{
                            fontWeight: '600',
                            color: idx === 0 ? 'var(--accent-primary, #7c3aed)' : 'var(--text-tertiary, #6b7280)',
                            minWidth: '20px'
                          }}>#{idx + 1}</span>
                          <span style={{ flex: 1, color: 'var(--text-primary, inherit)' }}>{time.day} at {time.time}</span>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <div style={{
                              width: '40px',
                              height: '4px',
                              backgroundColor: 'var(--border-color, #e5e7eb)',
                              borderRadius: '2px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${time.score}%`,
                                height: '100%',
                                backgroundColor: '#7c3aed',
                                borderRadius: '2px'
                              }} />
                            </div>
                            <span style={{ color: 'var(--text-tertiary, #6b7280)', fontSize: '10px', minWidth: '28px' }}>
                              {time.score}%
                            </span>
                          </div>
                          {time.avgEngagement && (
                            <span style={{ fontSize: '10px', color: 'var(--success-text, #10b981)' }}>
                              ~{time.avgEngagement} eng
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
                </>
              )}

              {/* Quick Actions */}
              <div className="quick-actions">
                <h4 className="quick-actions-title">⚡ Quick Actions</h4>
                <button
                  className="quick-action-btn"
                  onClick={handleGenerateHashtags}
                  disabled={isGeneratingHashtags}
                  title={!post.text ? "Write some text first to generate hashtags" : "Generate AI-powered hashtags for your post"}
                >
                  {isGeneratingHashtags
                    ? '⏳ Generating...'
                    : !post.text
                      ? '🔥 Add Hashtags (write text first)'
                      : '🔥 Add Hashtags'}
                </button>
                <button className="quick-action-btn" onClick={() => navigate('/schedule')}>
                  📅 View Schedule
                </button>
              </div>
            </div>
          </div>
        </FeatureGate>
      </div>

      {/* Draft Comments Section */}
      {currentDraftId && activeWorkspace && (
        <div className="compose-comments">
          <div className="comments-header">
            <h3>Draft Comments</h3>
            <span className="comments-hint">Collaborate with your team on this draft</span>
          </div>
          <CommentThread
            postId={currentDraftId}
            workspaceId={activeWorkspace.id}
            enableRealtime={true}
          />
          <CommentInput
            postId={currentDraftId}
            workspaceId={activeWorkspace.id}
            showPrioritySelector={true}
            placeholder="Add a comment or suggestion for this draft..."
          />
        </div>
      )}

      {/* Schedule Modal - New Geist UI Design */}
      <ScheduleModal
        isOpen={isOpen}
        onClose={handleCancelSchedule}
        onConfirm={handleConfirmSchedule}
        timezone={activeWorkspace?.timezone || 'UTC'}
        bestTimes={bestTimes}
        hasRealData={hasRealData}
        initialDate={scheduledDate || tempScheduledDate}
      />

      {/* AI Generation Modal */}
      <Modal isOpen={isAiOpen} onClose={onAiClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Generate Post with AI</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {aiVariations.length === 0 ? (
              <div>
                <p style={{ marginBottom: '10px', color: '#666' }}>
                  What would you like to post about?
                </p>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="E.g., Announce our new product launch, share a customer success story, promote our upcoming webinar..."
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />

                <p style={{ marginTop: '16px', marginBottom: '8px', color: '#666', fontSize: '14px' }}>
                  🔗 Website URL (optional)
                </p>
                <input
                  type="url"
                  value={aiWebsiteUrl}
                  onChange={(e) => setAiWebsiteUrl(e.target.value)}
                  placeholder="https://example.com/product-page"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                />
                <p style={{ marginTop: '6px', fontSize: '12px', color: '#999' }}>
                  AI will analyze the page content to create more relevant posts
                </p>

                <p style={{ marginTop: '12px', fontSize: '12px', color: '#999' }}>
                  Tip: Complete your Brand Profile for better AI-generated content
                </p>
              </div>
            ) : (
              <div>
                <p style={{ marginBottom: '15px', fontWeight: 'bold' }}>
                  Select a variation:
                </p>
                {aiVariations.map((variation, index) => (
                  <div
                    key={index}
                    onClick={() => handleSelectVariation(variation)}
                    style={{
                      padding: '16px',
                      marginBottom: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backgroundColor: '#ffffff',
                      color: '#111827'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#9333EA';
                      e.currentTarget.style.backgroundColor = '#f5f3ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.backgroundColor = '#ffffff';
                    }}
                  >
                    <div style={{ fontSize: '15px', whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#111827', fontWeight: '400' }}>
                      {variation.replace(/^\d+\.\s*/, '').replace(/^\*\*Variation\s+\d+:?\*\*\s*/i, '')}
                    </div>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAiVariations([]);
                    setAiPrompt("");
                    setAiWebsiteUrl("");
                  }}
                  style={{ marginTop: '10px' }}
                >
                  ← Generate Again
                </Button>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onAiClose} mr={3}>
              Cancel
            </Button>
            {aiVariations.length === 0 && (
              <Button
                colorScheme="purple"
                onClick={handleGenerateWithAI}
                isLoading={isGenerating}
                loadingText="Generating..."
                disabled={!aiPrompt.trim()}
              >
                Generate
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Media Upload Modal */}
      <MediaUploadModal
        isOpen={isMediaModalOpen}
        onClose={() => setIsMediaModalOpen(false)}
        onConfirm={handleMediaConfirm}
        existingFiles={[]}
        maxFiles={10}
        maxFileSize={50 * 1024 * 1024}
        maxTotalSize={200 * 1024 * 1024}
        workspaceId={activeWorkspace?.id}
        userId={user?.id}
      />

      {/* Scheduled Date Display */}
      {scheduledDate && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: '#6465f1',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '10px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000
        }}>
          Scheduled for: {scheduledDate.toLocaleString()}
        </div>
      )}
    </div>
  );
};
