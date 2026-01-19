import React, { useState, useCallback, useEffect, useRef } from "react";
import "./ComposeContent.css";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaReddit, FaTelegram, FaPinterest } from "react-icons/fa";
import { FaTiktok, FaThreads, FaBluesky, FaSnapchat } from "react-icons/fa6";
import { SiX, SiGooglemybusiness } from "react-icons/si";
import { useToast, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Button, useDisclosure } from "@chakra-ui/react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { baseURL } from "../utils/constants";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useConnectedAccounts } from "../hooks/useQueries";
import { supabase } from "../utils/supabaseClient";
import { formatDateInTimezone } from "../utils/timezones";
import { SubscriptionGuard } from "./subscription/SubscriptionGuard";
import FeatureGate from "./subscription/FeatureGate";
import { CommentThread } from "./comments/CommentThread";
import { CommentInput } from "./comments/CommentInput";

export const ComposeContent = () => {
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

  const [post, setPost] = useState({ text: "", media: null });
  const [networks, setNetworks] = useState({
    threads: false,
    telegram: false,
    twitter: false,
    googleBusiness: false,
    pinterest: false,
    tiktok: false,
    snapchat: false,
    instagram: false,
    bluesky: false,
    youtube: false,
    linkedin: false,
    facebook: false,
    reddit: false
  });
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [scheduledDate, setScheduledDate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPreviewPlatform, setSelectedPreviewPlatform] = useState("instagram");
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [isEditingScheduledPost, setIsEditingScheduledPost] = useState(false); // Track if editing a scheduled post
  const [lastSaved, setLastSaved] = useState(null);
  const autoSaveTimerRef = useRef(null);
  const isSavingRef = useRef(false); // Lock to prevent concurrent saves
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isAiOpen, onOpen: onAiOpen, onClose: onAiClose } = useDisclosure();
  const [engagementScore, setEngagementScore] = useState(0);
  const [bestPostingTime, setBestPostingTime] = useState("2:00 PM");
  const [hasRealData, setHasRealData] = useState(false);

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

  // Use React Query for connected accounts
  const { data: accountsData } = useConnectedAccounts(activeWorkspace?.id, user?.id);
  const connectedAccounts = accountsData?.accounts || [];
  const accountDetails = accountsData?.accountDetails || [];

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

  // Fetch real analytics data for best posting time
  useEffect(() => {
    const fetchBestTime = async () => {
      if (!user || !activeWorkspace) return;

      try {
        const res = await fetch(`${baseURL}/api/analytics/best-time?workspaceId=${activeWorkspace.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.hasData && data.bestHours && data.bestHours.length > 0) {
            const bestHour = data.bestHours[0].hour;
            const period = bestHour >= 12 ? 'PM' : 'AM';
            const displayHour = bestHour > 12 ? bestHour - 12 : (bestHour === 0 ? 12 : bestHour);
            setBestPostingTime(`${displayHour}:00 ${period}`);
            setHasRealData(true);
          } else {
            setHasRealData(false);
          }
        }
      } catch (err) {
        console.error("Error fetching analytics:", err);
        setHasRealData(false);
      }
    };
    fetchBestTime();
  }, [user, activeWorkspace]);

  // Load draft from sessionStorage if coming from Posts page
  useEffect(() => {
    const loadDraftData = sessionStorage.getItem("loadDraft");
    if (loadDraftData) {
      try {
        const draft = JSON.parse(loadDraftData);

        // Set the draft ID so we update instead of create new
        setCurrentDraftId(draft.id);

        // Check if this is editing a scheduled post
        if (draft.isEditingScheduledPost) {
          setIsEditingScheduledPost(true);
        }

        // Load caption
        if (draft.caption) {
          setPost(prev => ({ ...prev, text: draft.caption }));
        }

        // Load media preview
        if (draft.media_urls && draft.media_urls.length > 0) {
          const mediaUrl = draft.media_urls[0];
          setMediaPreview(mediaUrl);

          // Determine media type
          const url = mediaUrl.toLowerCase();
          if (url.includes('video') || url.endsWith('.mp4') || url.endsWith('.mov')) {
            setMediaType('video');
          } else {
            setMediaType('image');
          }

          // If it's a data URL, we need to convert it back to a File object for upload
          if (mediaUrl.startsWith('data:')) {
            convertDataUrlToFile(mediaUrl).then(file => {
              if (file) {
                setPost(prev => ({ ...prev, media: file }));
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
          setScheduledDate(new Date(draft.scheduled_date));
        }

        // Clear from sessionStorage
        sessionStorage.removeItem("loadDraft");

        toast({
          title: "Draft loaded",
          description: "Continue editing your draft",
          status: "info",
          duration: 2000,
          isClosable: true
        });
      } catch (error) {
        console.error("Error loading draft:", error);
      }
    }
  }, []); // Run once on mount

  // Helper function to convert data URL back to File object
  const convertDataUrlToFile = async (dataUrl) => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const filename = `draft-media-${Date.now()}.${blob.type.split('/')[1]}`;
      return new File([blob], filename, { type: blob.type });
    } catch (error) {
      console.error("Error converting data URL to file:", error);
      return null;
    }
  };

  // Auto-save draft functionality
  const saveDraft = useCallback(async () => {
    if (!user) return;

    // Prevent concurrent saves
    if (isSavingRef.current) return;

    // Don't save if there's no content
    const selectedPlatforms = Object.keys(networks).filter(key => networks[key]);
    if (!post.text && !mediaPreview && selectedPlatforms.length === 0) {
      return;
    }

    isSavingRef.current = true;

    try {
      const draftData = {
        workspace_id: activeWorkspace.id,
        user_id: user.id, // Keep for created_by tracking
        caption: post.text,
        media_urls: mediaPreview ? [mediaPreview] : [],
        platforms: selectedPlatforms,
        scheduled_date: scheduledDate ? scheduledDate.toISOString() : null,
        updated_at: new Date().toISOString()
      };

      if (currentDraftId) {
        // UPDATE existing draft using the ID
        const { error } = await supabase
          .from("post_drafts")
          .update(draftData)
          .eq("id", currentDraftId)
          .eq("workspace_id", activeWorkspace.id);

        if (error) throw error;
      } else {
        // CREATE new draft only if we don't have an ID
        const { data, error } = await supabase
          .from("post_drafts")
          .insert([draftData])
          .select()
          .single();

        if (error) throw error;
        if (data) setCurrentDraftId(data.id); // Store the ID for future updates
      }

      setLastSaved(new Date());
    } catch (error) {
      console.error("Error saving draft:", error);
    } finally {
      isSavingRef.current = false;
    }
  }, [user, post.text, mediaPreview, networks, scheduledDate, currentDraftId]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    if (post.text || mediaPreview || Object.values(networks).some(v => v)) {
      autoSaveTimerRef.current = setTimeout(() => {
        saveDraft();
      }, 30000);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [post.text, mediaPreview, networks, saveDraft]);

  // Save when navigating away
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveDraft();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      saveDraft();
    };
  }, [saveDraft]);

  // Calculate engagement score based on post content
  useEffect(() => {
    const calculateEngagementScore = () => {
      let score = 0;
      const text = post.text || "";
      const textLength = text.length;

      // Text length score (max 30 points)
      // Optimal: 100-150 characters
      if (textLength >= 100 && textLength <= 150) {
        score += 30;
      } else if (textLength >= 50 && textLength < 100) {
        score += 20;
      } else if (textLength > 150 && textLength <= 200) {
        score += 20;
      } else if (textLength > 0 && textLength < 50) {
        score += 10;
      } else if (textLength > 200) {
        score += 15;
      }

      // Hashtag count score (max 25 points)
      const hashtagCount = (text.match(/#\w+/g) || []).length;
      if (hashtagCount >= 5 && hashtagCount <= 10) {
        score += 25;
      } else if (hashtagCount >= 3 && hashtagCount < 5) {
        score += 20;
      } else if (hashtagCount > 10 && hashtagCount <= 15) {
        score += 15;
      } else if (hashtagCount > 0 && hashtagCount < 3) {
        score += 10;
      }

      // Media presence score (max 20 points)
      if (mediaPreview) {
        score += 20;
      }

      // Platform selection score (max 15 points)
      const selectedPlatforms = Object.values(networks).filter(v => v).length;
      if (selectedPlatforms >= 2 && selectedPlatforms <= 4) {
        score += 15;
      } else if (selectedPlatforms === 1) {
        score += 10;
      } else if (selectedPlatforms > 4) {
        score += 8;
      }

      // Call-to-action score (max 10 points)
      const hasCallToAction = /\b(click|link|check|visit|shop|buy|learn|sign up|join|follow|subscribe)\b/i.test(text);
      if (hasCallToAction) {
        score += 10;
      }

      setEngagementScore(Math.min(score, 100));
    };

    calculateEngagementScore();
  }, [post.text, mediaPreview, networks]);

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
    'reddit': 'reddit',
    'telegram': 'telegram',
    'bluesky': 'bluesky',
    'snapchat': 'snapchat',
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
      const accountName = typeof account === 'string' ? account : account.name;
      if (!accountName) return false;

      const normalized = accountName.toLowerCase();
      const mapped = platformNameMap[normalized] || normalized;
      return mapped === platformKey;
    });

    return result;
  };

  const socialNetworks = [
    { name: "threads", displayName: "Threads", icon: FaThreads, color: "#000000" },
    { name: "telegram", displayName: "Telegram", icon: FaTelegram, color: "#0088cc" },
    { name: "twitter", displayName: "Twitter", icon: SiX, color: "#000000" },
    { name: "googleBusiness", displayName: "Google Business", icon: SiGooglemybusiness, color: "#4285F4" },
    { name: "pinterest", displayName: "Pinterest", icon: FaPinterest, color: "#BD081C" },
    { name: "tiktok", displayName: "TikTok", icon: FaTiktok, color: "#000000" },
    { name: "snapchat", displayName: "Snapchat", icon: FaSnapchat, color: "#FFFC00" },
    { name: "instagram", displayName: "Instagram", icon: FaInstagram, color: "#E4405F" },
    { name: "bluesky", displayName: "BlueSky", icon: FaBluesky, color: "#1185FE" },
    { name: "youtube", displayName: "Youtube", icon: FaYoutube, color: "#FF0000" },
    { name: "linkedin", displayName: "LinkedIn", icon: FaLinkedinIn, color: "#0A66C2" },
    { name: "facebook", displayName: "Facebook", icon: FaFacebookF, color: "#1877F2" },
    { name: "reddit", displayName: "Reddit", icon: FaReddit, color: "#FF4500" }
  ].map(network => ({
    ...network,
    linked: isLinked(network.name)
  }));

  const handleTextChange = (e) => {
    setPost({ ...post, text: e.target.value });
  };

  const handleMediaChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPost({ ...post, media: file });
      setMediaType(file.type.split("/")[0]);

      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
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

  const handleConfirmSchedule = async () => {
    if (!tempScheduledDate || !user) return;

    setIsLoading(true);
    onClose();

    // Use JSON for requests without file uploads (better Vercel compatibility)
    const hasFileUpload = post.media instanceof File;

    try {
      let response;

      if (hasFileUpload) {
        // Use FormData for file uploads
        const formData = new FormData();
        formData.append("text", post.text);
        formData.append("userId", user.id);
        formData.append("workspaceId", activeWorkspace.id);
        formData.append("media", post.media);
        formData.append("networks", JSON.stringify(networks));
        formData.append("scheduledDate", tempScheduledDate.toISOString());

        // If editing a scheduled post, include the postId
        if (isEditingScheduledPost && currentDraftId) {
          formData.append("postId", currentDraftId);
        }

        response = await fetch(`${baseURL}/api/post`, {
          method: "POST",
          body: formData
        });
      } else {
        // Use JSON for text-only or URL media posts
        response = await fetch(`${baseURL}/api/post`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: post.text,
            userId: user.id,
            workspaceId: activeWorkspace.id,
            mediaUrl: mediaPreview && typeof mediaPreview === 'string' && mediaPreview.startsWith('http') ? mediaPreview : null,
            networks: JSON.stringify(networks),
            scheduledDate: tempScheduledDate.toISOString(),
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
            : `Your post will be published on ${tempScheduledDate.toLocaleString()}`,
          status: "success",
          duration: 4000,
          isClosable: true
        });

        // Reset form completely
        setPost({ text: "", media: null });
        setNetworks({
          threads: false,
          telegram: false,
          twitter: false,
          googleBusiness: false,
          pinterest: false,
          tiktok: false,
          snapchat: false,
          instagram: false,
          bluesky: false,
          youtube: false,
          linkedin: false,
          facebook: false,
          reddit: false
        });
        setMediaPreview(null);
        setMediaType(null);
        setScheduledDate(null);
        setTempScheduledDate(null);
        setCurrentDraftId(null);
        setLastSaved(null);
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
    setTempScheduledDate(null);
    setScheduledDate(null);
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
    const hasContent = post.text || mediaPreview;

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
          <div className="platform-preview instagram-preview">
            {/* Instagram Status Bar */}
            <div className="status-bar">
              <span className="status-time">9:41</span>
              <div className="status-icons">
                <span>📶</span>
                <span>📡</span>
                <span>🔋</span>
              </div>
            </div>

            {/* Instagram Header */}
            <div className="instagram-header">
              <span className="header-logo">Instagram</span>
              <div className="header-icons">
                <span>♡</span>
                <span>✈</span>
              </div>
            </div>

            {/* Stories Row */}
            <div className="instagram-stories">
              <div className="story-item">
                <div className="story-avatar active">
                  <div className="story-avatar-inner">👤</div>
                </div>
                <span className="story-name">Your story</span>
              </div>
              <div className="story-item">
                <div className="story-avatar">
                  <div className="story-avatar-inner">👤</div>
                </div>
                <span className="story-name">friend1</span>
              </div>
              <div className="story-item">
                <div className="story-avatar">
                  <div className="story-avatar-inner">👤</div>
                </div>
                <span className="story-name">friend2</span>
              </div>
            </div>

            {/* Post */}
            <div className="instagram-post">
              <div className="post-header">
                <div className="post-profile">
                  {getAccountInfo('instagram').profilePicture ? (
                    <img src={getAccountInfo('instagram').profilePicture} alt="Profile" className="preview-avatar-img" />
                  ) : (
                    <div className="preview-avatar">👤</div>
                  )}
                  <div className="preview-username">{getAccountInfo('instagram').username}</div>
                </div>
                <div className="preview-menu">⋯</div>
              </div>

              {mediaPreview && (
                <div className="post-media">
                  {mediaType === "image" ? (
                    <img src={mediaPreview} alt="Preview" />
                  ) : (
                    <video src={mediaPreview} controls style={{ width: '100%', height: 'auto' }} />
                  )}
                </div>
              )}

              <div className="post-actions">
                <div className="action-icons">
                  <span>♡</span>
                  <span>💬</span>
                  <span>✈</span>
                </div>
                <span>🔖</span>
              </div>

              <div className="post-likes">Be the first to like this</div>

              {post.text && (
                <div className="post-caption">
                  <span className="caption-username">{getAccountInfo('instagram').username}</span> {post.text}
                </div>
              )}

              <div className="post-time">JUST NOW</div>
            </div>

            {/* Instagram Bottom Nav */}
            <div className="instagram-nav">
              <span>🏠</span>
              <span>🔍</span>
              <span>➕</span>
              <span>❤️</span>
              <span>👤</span>
            </div>
          </div>
        );

      case "facebook":
        return (
          <div className="platform-preview facebook-preview">
            {/* Status Bar */}
            <div className="status-bar">
              <span className="status-time">9:41</span>
              <div className="status-icons">
                <span>📶</span>
                <span>📡</span>
                <span>🔋</span>
              </div>
            </div>

            {/* Facebook Header */}
            <div className="facebook-header">
              <span className="fb-logo">facebook</span>
              <div className="fb-header-icons">
                <span>🔍</span>
                <span>💬</span>
              </div>
            </div>

            {/* Feed Tabs */}
            <div className="facebook-tabs">
              <div className="fb-tab active">
                <span>🏠</span>
                <span>Home</span>
              </div>
              <div className="fb-tab">
                <span>📺</span>
                <span>Watch</span>
              </div>
              <div className="fb-tab">
                <span>🛍️</span>
                <span>Marketplace</span>
              </div>
            </div>

            {/* Facebook Post */}
            <div className="facebook-feed">
              <div className="fb-post">
                <div className="fb-post-header">
                  <div className="fb-post-profile">
                    {getAccountInfo('facebook').profilePicture ? (
                      <img src={getAccountInfo('facebook').profilePicture} alt="Profile" className="preview-avatar-img" />
                    ) : (
                      <div className="preview-avatar">👤</div>
                    )}
                    <div className="fb-post-meta">
                      <div className="preview-username">{getAccountInfo('facebook').username}</div>
                      <div className="preview-timestamp">Just now · 🌍</div>
                    </div>
                  </div>
                  <div className="preview-menu">⋯</div>
                </div>

                {post.text && (
                  <div className="fb-post-text">{post.text}</div>
                )}

                {mediaPreview && (
                  <div className="fb-post-media">
                    {mediaType === "image" ? (
                      <img src={mediaPreview} alt="Preview" />
                    ) : (
                      <video src={mediaPreview} controls />
                    )}
                  </div>
                )}

                <div className="fb-post-engagement">
                  <span>Be the first to react</span>
                  <span>0 comments</span>
                </div>

                <div className="fb-post-actions">
                  <button>👍 Like</button>
                  <button>💬 Comment</button>
                  <button>↗ Share</button>
                </div>
              </div>
            </div>

            {/* Facebook Bottom Nav */}
            <div className="facebook-nav">
              <span>🏠</span>
              <span>👥</span>
              <span>📺</span>
              <span>🛍️</span>
              <span>🔔</span>
              <span>☰</span>
            </div>
          </div>
        );

      case "twitter":
        return (
          <div className="platform-preview twitter-preview">
            {/* Status Bar */}
            <div className="status-bar">
              <span className="status-time">9:41</span>
              <div className="status-icons">
                <span>📶</span>
                <span>📡</span>
                <span>🔋</span>
              </div>
            </div>

            {/* Twitter Header */}
            <div className="twitter-header">
              {getAccountInfo('twitter').profilePicture ? (
                <img src={getAccountInfo('twitter').profilePicture} alt="Profile" className="twitter-avatar-small-img" />
              ) : (
                <div className="twitter-avatar-small">👤</div>
              )}
              <span className="twitter-logo">𝕏</span>
              <span className="twitter-settings">⚙️</span>
            </div>

            {/* Timeline Tabs */}
            <div className="twitter-tabs">
              <div className="twitter-tab active">For you</div>
              <div className="twitter-tab">Following</div>
            </div>

            {/* Tweet */}
            <div className="twitter-feed">
              <div className="tweet">
                {getAccountInfo('twitter').profilePicture ? (
                  <img src={getAccountInfo('twitter').profilePicture} alt="Profile" className="tweet-avatar-img" />
                ) : (
                  <div className="tweet-avatar">👤</div>
                )}
                <div className="tweet-content">
                  <div className="tweet-header">
                    <span className="tweet-name">{getAccountInfo('twitter').username}</span>
                    <span className="tweet-handle">@{getAccountInfo('twitter').username.toLowerCase().replace(/\s+/g, '')} · now</span>
                  </div>

                  {post.text && (
                    <div className="tweet-text">{post.text}</div>
                  )}

                  {mediaPreview && (
                    <div className="tweet-media">
                      {mediaType === "image" ? (
                        <img src={mediaPreview} alt="Preview" />
                      ) : (
                        <video src={mediaPreview} controls />
                      )}
                    </div>
                  )}

                  <div className="tweet-actions">
                    <span>💬 0</span>
                    <span>🔁 0</span>
                    <span>♡ 0</span>
                    <span>📊 0</span>
                    <span>↗</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Twitter Bottom Nav */}
            <div className="twitter-nav">
              <span>🏠</span>
              <span>🔍</span>
              <span>🔔</span>
              <span>✉️</span>
            </div>
          </div>
        );

      case "linkedin":
        return (
          <div className="platform-preview linkedin-preview">
            {/* Status Bar */}
            <div className="status-bar">
              <span className="status-time">9:41</span>
              <div className="status-icons">
                <span>📶</span>
                <span>📡</span>
                <span>🔋</span>
              </div>
            </div>

            {/* LinkedIn Header */}
            <div className="linkedin-header">
              <div className="linkedin-search">
                <span>🔍</span>
                <span className="search-text">Search</span>
              </div>
              <div className="linkedin-header-icons">
                <span>💬</span>
              </div>
            </div>

            {/* LinkedIn Feed */}
            <div className="linkedin-feed">
              <div className="linkedin-post">
                <div className="linkedin-post-header">
                  <div className="linkedin-profile">
                    {getAccountInfo('linkedin').profilePicture ? (
                      <img src={getAccountInfo('linkedin').profilePicture} alt="Profile" className="preview-avatar-img" />
                    ) : (
                      <div className="preview-avatar">👤</div>
                    )}
                    <div className="linkedin-meta">
                      <div className="preview-username">{getAccountInfo('linkedin').username}</div>
                      <div className="linkedin-headline">{profile?.business_name || 'Your Business'}</div>
                      <div className="preview-timestamp">Just now · 🌍</div>
                    </div>
                  </div>
                  <div className="preview-menu">⋯</div>
                </div>

                {post.text && (
                  <div className="linkedin-post-text">{post.text}</div>
                )}

                {mediaPreview && (
                  <div className="linkedin-post-media">
                    {mediaType === "image" ? (
                      <img src={mediaPreview} alt="Preview" />
                    ) : (
                      <video src={mediaPreview} controls />
                    )}
                  </div>
                )}

                <div className="linkedin-post-stats">
                  <span>Be the first to react</span>
                </div>

                <div className="linkedin-post-actions">
                  <button>👍 Like</button>
                  <button>💬 Comment</button>
                  <button>🔁 Repost</button>
                  <button>↗ Send</button>
                </div>
              </div>
            </div>

            {/* LinkedIn Bottom Nav */}
            <div className="linkedin-nav">
              <span>🏠<br/>Home</span>
              <span>👥<br/>Network</span>
              <span>➕<br/>Post</span>
              <span>🔔<br/>Notifications</span>
              <span>💼<br/>Jobs</span>
            </div>
          </div>
        );

      case "threads":
        return (
          <div className="platform-preview threads-preview">
            {/* Status Bar */}
            <div className="status-bar">
              <span className="status-time">9:41</span>
              <div className="status-icons">
                <span>📶</span>
                <span>📡</span>
                <span>🔋</span>
              </div>
            </div>

            {/* Threads Header */}
            <div className="threads-header">
              <span className="threads-logo">@</span>
              <div className="threads-header-icons">
                <span>♡</span>
              </div>
            </div>

            {/* Threads Feed */}
            <div className="threads-feed">
              <div className="thread-post">
                <div className="thread-post-header">
                  <div className="thread-profile">
                    {getAccountInfo('threads').profilePicture ? (
                      <img src={getAccountInfo('threads').profilePicture} alt="Profile" className="preview-avatar-img" />
                    ) : (
                      <div className="preview-avatar">👤</div>
                    )}
                    <div className="thread-meta">
                      <span className="preview-username">{getAccountInfo('threads').username}</span>
                      <span className="thread-verified">✓</span>
                    </div>
                  </div>
                  <div className="thread-time">now</div>
                </div>

                {post.text && (
                  <div className="thread-text">{post.text}</div>
                )}

                {mediaPreview && (
                  <div className="thread-media">
                    {mediaType === "image" ? (
                      <img src={mediaPreview} alt="Preview" />
                    ) : (
                      <video src={mediaPreview} controls />
                    )}
                  </div>
                )}

                <div className="thread-actions">
                  <span>♡</span>
                  <span>💬</span>
                  <span>🔁</span>
                  <span>↗</span>
                </div>

                <div className="thread-stats">
                  <span>0 replies · 0 likes</span>
                </div>
              </div>
            </div>

            {/* Threads Bottom Nav */}
            <div className="threads-nav">
              <span>🏠</span>
              <span>🔍</span>
              <span>✏️</span>
              <span>❤️</span>
              <span>👤</span>
            </div>
          </div>
        );

      case "tiktok":
        return (
          <div className="platform-preview tiktok-preview">
            {/* Status Bar */}
            <div className="status-bar tiktok-status">
              <span className="status-time">9:41</span>
              <div className="status-icons">
                <span>📶</span>
                <span>📡</span>
                <span>🔋</span>
              </div>
            </div>

            {/* TikTok Header */}
            <div className="tiktok-header">
              <span>Following</span>
              <span className="tiktok-tab-active">For You</span>
            </div>

            {/* TikTok Video Content */}
            <div className="tiktok-video">
              {mediaPreview && (
                <div className="tiktok-video-bg">
                  {mediaType === "image" ? (
                    <img src={mediaPreview} alt="Preview" />
                  ) : (
                    <video src={mediaPreview} controls style={{ width: '100%', height: 'auto' }} />
                  )}
                </div>
              )}

              {/* User Info & Caption */}
              <div className="tiktok-info">
                <div className="tiktok-user">
                  <span className="tiktok-username">@yourusername</span>
                  <button className="tiktok-follow">Follow</button>
                </div>
                {post.text && (
                  <div className="tiktok-caption">{post.text}</div>
                )}
                <div className="tiktok-sound">🎵 Original sound - yourusername</div>
              </div>

              {/* Right Sidebar Actions */}
              <div className="tiktok-sidebar">
                <div className="tiktok-sidebar-item">
                  <div className="tiktok-avatar">👤</div>
                </div>
                <div className="tiktok-sidebar-item">
                  <span>♡</span>
                  <span className="count">12.3K</span>
                </div>
                <div className="tiktok-sidebar-item">
                  <span>💬</span>
                  <span className="count">234</span>
                </div>
                <div className="tiktok-sidebar-item">
                  <span>🔖</span>
                  <span className="count">567</span>
                </div>
                <div className="tiktok-sidebar-item">
                  <span>↗</span>
                  <span className="count">89</span>
                </div>
              </div>
            </div>

            {/* TikTok Bottom Nav */}
            <div className="tiktok-nav">
              <span>🏠<br/>Home</span>
              <span>👥<br/>Friends</span>
              <span className="tiktok-create">➕</span>
              <span>💬<br/>Inbox</span>
              <span>👤<br/>Profile</span>
            </div>
          </div>
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
      const response = await fetch(`${baseURL}/api/hashtag/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: post.text,
          numHashtags: 5
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate hashtags");
      }

      const data = await response.json();

      if (data.success && data.hashtags && data.hashtags.length > 0) {
        // Append hashtags to the end of the post text
        const hashtagsText = '\n\n' + data.hashtags.join(' ');
        setPost({ ...post, text: post.text + hashtagsText });

        toast({
          title: "Hashtags generated",
          description: `Added ${data.hashtags.length} hashtags to your post.`,
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

    // Use JSON for requests without file uploads (better Vercel compatibility)
    const hasFileUpload = post.media instanceof File;
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
        // Use FormData for file uploads
        const formData = new FormData();
        formData.append("text", post.text);
        formData.append("userId", user.id);
        formData.append("workspaceId", activeWorkspace.id);
        formData.append("media", post.media);
        formData.append("networks", JSON.stringify(networks));
        if (scheduledTime) {
          formData.append("scheduledDate", scheduledTime.toISOString());
        }

        // If editing a scheduled post, include the postId
        if (isEditingScheduledPost && currentDraftId) {
          formData.append("postId", currentDraftId);
        }

        response = await fetch(`${baseURL}/api/post`, {
          method: "POST",
          body: formData
        });
      } else {
        // Use JSON for text-only or URL media posts
        const mediaUrl = mediaPreview && typeof mediaPreview === 'string' && mediaPreview.startsWith('http') ? mediaPreview : null;

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
            await supabase
              .from("post_drafts")
              .delete()
              .eq("id", currentDraftId)
              .eq("workspace_id", activeWorkspace.id);
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
        // Reset form
        setPost({ text: "", media: null });
        setNetworks({
          threads: false,
          telegram: false,
          twitter: false,
          googleBusiness: false,
          pinterest: false,
          tiktok: false,
          snapchat: false,
          instagram: false,
          bluesky: false,
          youtube: false,
          linkedin: false,
          facebook: false,
          reddit: false
        });
        setMediaPreview(null);
        setMediaType(null);
        setScheduledDate(null);
        setCurrentDraftId(null);
        setLastSaved(null);
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

  return (
    <div className="compose-content">
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

            <div className="form-footer">
              <div className="form-actions">
                <label htmlFor="media-upload" className="media-upload-btn">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M21 19V5C21 3.9 20.1 3 19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19ZM8.5 13.5L11 16.51L14.5 12L19 18H5L8.5 13.5Z" fill="currentColor"/>
                  </svg>
                </label>
                <input
                  id="media-upload"
                  type="file"
                  onChange={handleMediaChange}
                  accept="image/*,video/*"
                  style={{ display: "none" }}
                />
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
                    ✨
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
              </div>
            </div>

            {/* Link Shortener Section */}
            {showLinkShortener && (
              <div style={{
                marginTop: '20px',
                padding: '16px',
                backgroundColor: '#F1F6F4',
                borderRadius: '10px',
                border: '1px solid rgba(0, 0, 0, 0.1)'
              }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#114C5A' }}>
                  Link Shortener & Tracker
                </h4>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <input
                    type="url"
                    value={urlToShorten}
                    onChange={(e) => setUrlToShorten(e.target.value)}
                    placeholder="Enter URL to shorten (e.g., https://example.com)"
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      border: '1px solid rgba(0, 0, 0, 0.2)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontFamily: 'Inter, sans-serif'
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
                      color: '#114C5A',
                      cursor: isShorteningLink || !urlToShorten ? 'not-allowed' : 'pointer',
                      opacity: isShorteningLink || !urlToShorten ? 0.5 : 1
                    }}
                  >
                    {isShorteningLink ? 'Shortening...' : 'Shorten'}
                  </button>
                </div>

                {shortenedLink && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: 'rgba(255, 200, 1, 0.1)',
                    borderRadius: '8px',
                    border: '1px solid #afabf9'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="text"
                        value={shortenedLink.shortLink}
                        readOnly
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          backgroundColor: '#ffffff',
                          border: '1px solid rgba(0, 0, 0, 0.1)',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontFamily: 'monospace'
                        }}
                      />
                      <button
                        onClick={handleCopyShortLink}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#114C5A',
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
                    <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'rgba(0, 0, 0, 0.6)' }}>
                      ✓ This link is trackable. View analytics in the Posts tab after using it.
                    </p>
                  </div>
                )}
              </div>
            )}
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
            <div className="phone-mockup">
              <div className="phone-notch">
                <div className="notch-line" />
                <div className="notch-line" />
              </div>

              <div className="phone-content">
                {renderPlatformPreview()}
              </div>
            </div>
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

              {/* Prediction Details */}
              <div className="prediction-details">
                <div className="prediction-item">
                  <span className="prediction-icon">🕐</span>
                  <div className="prediction-info">
                    <span className="prediction-label">
                      Best time: {hasRealData ? "📊" : "📈"}
                    </span>
                    <span className="prediction-value">{getBestPostingTime()}</span>
                    {hasRealData && (
                      <span style={{ fontSize: '10px', color: '#10b981' }}>
                        Based on your analytics
                      </span>
                    )}
                  </div>
                </div>

                <div className="prediction-item">
                  <span className="prediction-icon">#</span>
                  <div className="prediction-info">
                    <span className="prediction-label">Hashtags:</span>
                    <span className="prediction-value">{getHashtagCount()} / 5-10</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="quick-actions">
                <h4 className="quick-actions-title">⚡ Quick Actions</h4>
                <button className="quick-action-btn">🔥 Trending Hashtags</button>
                <button className="quick-action-btn">♻️ Recycle Top Post</button>
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

      {/* Schedule Modal */}
      <Modal isOpen={isOpen} onClose={handleCancelSchedule}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Schedule Post</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <DatePicker
              selected={tempScheduledDate}
              onChange={handleDateSelect}
              showTimeSelect
              timeIntervals={15}
              dateFormat="Pp"
              minDate={new Date()}
              inline
            />
            {tempScheduledDate && (
              <div style={{
                marginTop: '20px',
                padding: '15px',
                backgroundColor: '#f0f4ff',
                borderRadius: '8px',
                border: '1px solid #6465f1'
              }}>
                <strong>Selected Date & Time:</strong>
                <div style={{ marginTop: '8px', fontSize: '16px', color: '#6465f1' }}>
                  {formatDateInTimezone(tempScheduledDate, profile?.timezone || 'UTC')}
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={handleCancelSchedule} mr={3}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleConfirmSchedule}
              isDisabled={!tempScheduledDate}
            >
              Confirm Schedule
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* AI Generation Modal */}
      <Modal isOpen={isAiOpen} onClose={onAiClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>✨ Generate Post with AI</ModalHeader>
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
                  💡 Tip: Complete your Brand Profile for better AI-generated content
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
                      padding: '15px',
                      marginBottom: '10px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backgroundColor: '#f9fafb'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#6465f1';
                      e.currentTarget.style.backgroundColor = '#f5f3ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }}
                  >
                    <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>
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
