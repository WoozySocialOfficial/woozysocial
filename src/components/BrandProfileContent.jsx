import React, { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useBrandProfile } from "../hooks/useQueries";
import { supabase } from "../utils/supabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { LoadingContainer } from "./ui/LoadingSpinner";
import "./BrandProfileContent.css";

// Draft key is workspace-specific
const getDraftKey = (workspaceId) => `brand_profile_draft_${workspaceId}`;

export const BrandProfileContent = () => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const autoSaveTimerRef = useRef(null);
  const hasLoadedData = useRef(false);

  // Get the draft key for the current workspace
  const draftKey = activeWorkspace?.id ? getDraftKey(activeWorkspace.id) : null;

  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [toneOfVoice, setToneOfVoice] = useState("Professional");
  const [targetAudience, setTargetAudience] = useState("");
  const [keyTopics, setKeyTopics] = useState("");
  const [brandValues, setBrandValues] = useState("");
  const [samplePosts, setSamplePosts] = useState("");

  // Use React Query for brand profile (cached!) - must use workspace_id
  const { data: profileData, isLoading } = useBrandProfile(activeWorkspace?.id);

  // Auto-save draft to localStorage (workspace-specific)
  const saveDraft = useCallback(() => {
    if (!draftKey) return;
    const draft = {
      brandName,
      websiteUrl,
      brandDescription,
      toneOfVoice,
      targetAudience,
      keyTopics,
      brandValues,
      samplePosts,
      workspaceId: activeWorkspace?.id,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
    setHasDraft(true);
  }, [brandName, websiteUrl, brandDescription, toneOfVoice, targetAudience, keyTopics, brandValues, samplePosts, activeWorkspace?.id, draftKey]);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    localStorage.removeItem(draftKey);
    setHasDraft(false);
  }, [draftKey]);

  // Load draft from localStorage on mount / workspace change
  useEffect(() => {
    if (!draftKey) return;
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        // Verify the draft belongs to this workspace
        if (draft.workspaceId === activeWorkspace?.id) {
          setHasDraft(true);
        }
      } catch (e) {
        localStorage.removeItem(draftKey);
      }
    } else {
      setHasDraft(false);
    }
  }, [activeWorkspace?.id, draftKey]);

  // Populate form when data loads (from DB or draft)
  useEffect(() => {
    if (hasLoadedData.current || !draftKey) return;

    // Check for draft first
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.workspaceId === activeWorkspace?.id) {
          // Load from draft
          setBrandName(draft.brandName || "");
          setWebsiteUrl(draft.websiteUrl || "");
          setBrandDescription(draft.brandDescription || "");
          setToneOfVoice(draft.toneOfVoice || "Professional");
          setTargetAudience(draft.targetAudience || "");
          setKeyTopics(draft.keyTopics || "");
          setBrandValues(draft.brandValues || "");
          setSamplePosts(draft.samplePosts || "");
          hasLoadedData.current = true;
          return;
        }
      } catch (e) {
        // Invalid draft, ignore
      }
    }

    // Otherwise load from profile data
    if (profileData) {
      setBrandName(profileData.brand_name || "");
      setWebsiteUrl(profileData.website_url || "");
      setBrandDescription(profileData.brand_description || "");
      setToneOfVoice(profileData.tone_of_voice || "Professional");
      setTargetAudience(profileData.target_audience || "");
      setKeyTopics(profileData.key_topics || "");
      setBrandValues(profileData.brand_values || "");
      setSamplePosts(profileData.sample_posts || "");
      hasLoadedData.current = true;
    }
  }, [profileData, activeWorkspace?.id, draftKey]);

  // Auto-save draft when form changes (debounced)
  useEffect(() => {
    if (!hasLoadedData.current) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      saveDraft();
    }, 1000); // Save after 1 second of no typing

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [brandName, websiteUrl, brandDescription, toneOfVoice, targetAudience, keyTopics, brandValues, samplePosts, saveDraft]);

  const handleSave = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to save",
        status: "error",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    setIsSaving(true);
    try {
      if (!activeWorkspace?.id) {
        throw new Error('No active workspace selected');
      }

      const profileData = {
        workspace_id: activeWorkspace.id,
        brand_name: brandName,
        website_url: websiteUrl,
        brand_description: brandDescription,
        tone_of_voice: toneOfVoice,
        target_audience: targetAudience,
        key_topics: keyTopics,
        brand_values: brandValues,
        sample_posts: samplePosts,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('brand_profiles')
        .upsert(profileData, { onConflict: 'workspace_id' });

      if (error) throw error;

      // Clear the draft since we saved successfully
      clearDraft();

      // Invalidate cache so next load is fresh
      if (activeWorkspace?.id) {
        queryClient.invalidateQueries({ queryKey: ["brandProfile", activeWorkspace.id] });
      }

      toast({
        title: "Brand profile saved!",
        description: "Your brand profile has been updated successfully",
        status: "success",
        duration: 3000,
        isClosable: true
      });
    } catch (error) {
      console.error("Error saving brand profile:", error);
      toast({
        title: "Error saving brand profile",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="brand-profile-container">
        <div className="brand-profile-header">
          <h1 className="page-title">Brand Profile</h1>
          <p className="page-subtitle">Define your brand to help AI generate better content</p>
        </div>
        <LoadingContainer message="Loading brand profile..." />
      </div>
    );
  }

  // Discard draft and reload from database
  const handleDiscardDraft = () => {
    clearDraft();
    hasLoadedData.current = false;
    if (profileData) {
      setBrandName(profileData.brand_name || "");
      setWebsiteUrl(profileData.website_url || "");
      setBrandDescription(profileData.brand_description || "");
      setToneOfVoice(profileData.tone_of_voice || "Professional");
      setTargetAudience(profileData.target_audience || "");
      setKeyTopics(profileData.key_topics || "");
      setBrandValues(profileData.brand_values || "");
      setSamplePosts(profileData.sample_posts || "");
    } else {
      setBrandName("");
      setWebsiteUrl("");
      setBrandDescription("");
      setToneOfVoice("Professional");
      setTargetAudience("");
      setKeyTopics("");
      setBrandValues("");
      setSamplePosts("");
    }
    hasLoadedData.current = true;
    toast({
      title: "Draft discarded",
      description: "Loaded saved profile data",
      status: "info",
      duration: 2000,
      isClosable: true
    });
  };

  return (
    <div className="brand-profile-container">
      <div className="brand-profile-header">
        <h1 className="page-title">Brand Profile</h1>
        <p className="page-subtitle">Define your brand to help AI generate better content</p>
      </div>

      <div className="brand-profile-content">
        <div className="brand-section">
          <h2 className="section-title">Brand Information</h2>
          <p className="section-subtitle">Define your brand identity</p>

          <div className="form-group">
            <label htmlFor="brandName">Brand Name</label>
            <input
              type="text"
              id="brandName"
              placeholder="Your brand name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="websiteUrl">Website URL</label>
            <input
              type="url"
              id="websiteUrl"
              placeholder="https://yourbrand.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              AI will analyze your website to better understand your brand
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="brandDescription">Brand Description</label>
            <textarea
              id="brandDescription"
              placeholder="Describe what your brand does, its mission, and unique value..."
              rows="4"
              value={brandDescription}
              onChange={(e) => setBrandDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="toneOfVoice">Tone of Voice</label>
            <select
              id="toneOfVoice"
              value={toneOfVoice}
              onChange={(e) => setToneOfVoice(e.target.value)}
            >
              <option value="Professional">Professional</option>
              <option value="Casual">Casual</option>
              <option value="Friendly">Friendly</option>
              <option value="Formal">Formal</option>
              <option value="Humorous">Humorous</option>
              <option value="Inspirational">Inspirational</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="targetAudience">Target Audience</label>
            <textarea
              id="targetAudience"
              placeholder="Describe your target audience (age, interests, demographics, pain points)..."
              rows="3"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="keyTopics">Key Topics & Themes</label>
            <textarea
              id="keyTopics"
              placeholder="What topics does your brand talk about? (e.g., technology, sustainability, health, fashion)"
              rows="3"
              value={keyTopics}
              onChange={(e) => setKeyTopics(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="brandValues">Brand Values</label>
            <textarea
              id="brandValues"
              placeholder="What values does your brand stand for? (e.g., innovation, transparency, inclusivity)"
              rows="3"
              value={brandValues}
              onChange={(e) => setBrandValues(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="samplePosts">Sample Posts (Optional)</label>
            <textarea
              id="samplePosts"
              placeholder="Paste 2-3 example posts that represent your brand voice well..."
              rows="6"
              value={samplePosts}
              onChange={(e) => setSamplePosts(e.target.value)}
            />
            <small style={{ color: '#666', fontSize: '12px' }}>
              These help AI understand your writing style
            </small>
          </div>

          <button
            className="save-button"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Brand Profile"}
          </button>
        </div>
      </div>
    </div>
  );
};
