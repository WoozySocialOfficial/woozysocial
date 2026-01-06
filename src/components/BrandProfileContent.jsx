import React, { useState, useEffect } from "react";
import { useToast } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { supabase } from "../utils/supabaseClient";
import "./BrandProfileContent.css";

export const BrandProfileContent = () => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [toneOfVoice, setToneOfVoice] = useState("Professional");
  const [targetAudience, setTargetAudience] = useState("");
  const [keyTopics, setKeyTopics] = useState("");
  const [brandValues, setBrandValues] = useState("");
  const [samplePosts, setSamplePosts] = useState("");

  // Load brand profile on mount
  useEffect(() => {
    const loadBrandProfile = async () => {
      if (!user) return;

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('brand_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
          throw error;
        }

        if (data) {
          setBrandName(data.brand_name || "");
          setWebsiteUrl(data.website_url || "");
          setBrandDescription(data.brand_description || "");
          setToneOfVoice(data.tone_of_voice || "Professional");
          setTargetAudience(data.target_audience || "");
          setKeyTopics(data.key_topics || "");
          setBrandValues(data.brand_values || "");
          setSamplePosts(data.sample_posts || "");
        }
      } catch (error) {
        console.error("Error loading brand profile:", error);
        toast({
          title: "Error loading brand profile",
          description: error.message,
          status: "error",
          duration: 3000,
          isClosable: true
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadBrandProfile();
  }, [user, toast]);

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
      const profileData = {
        user_id: user.id,
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
        .upsert(profileData, { onConflict: 'user_id' });

      if (error) throw error;

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
          <p className="page-subtitle">Loading...</p>
        </div>
      </div>
    );
  }

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
