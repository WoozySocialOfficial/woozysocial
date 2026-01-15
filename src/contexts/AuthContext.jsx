import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import {
  baseURL,
  SUBSCRIPTION_TIERS,
  getTierConfig,
  hasFeature,
  hasTabAccess,
  canCreateWorkspace,
  canInviteTeamMember,
  getWorkspaceLimit,
  getTeamMemberLimit
} from '../utils/constants';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email, password, fullName) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      // Create user profile (trigger will handle this, but we still try for fallback)
      if (data.user) {
        try {
          const { error: profileError } = await supabase
            .from('user_profiles')
            .insert([
              {
                id: data.user.id,
                email: email,
                full_name: fullName,
              },
            ]);

          // Ignore duplicate key errors (trigger already created profile)
          if (profileError && !profileError.message.includes('duplicate')) {
            throw profileError;
          }
        } catch (err) {
          console.warn('Profile insert error (may be expected if trigger created it):', err);
        }

        // Check if user is whitelisted and create Ayrshare profile if eligible
        // This allows test/dev accounts to bypass payment during development
        try {
          const response = await fetch(`${baseURL}/api/check-and-create-profile`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: data.user.id,
              email: email,
              title: `${fullName || email}'s Profile`
            }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.profileCreated) {
              console.log('Ayrshare profile created for whitelisted user:', result);
            } else {
              console.log('User not whitelisted - profile will be created after payment');
            }
          } else {
            const errorData = await response.json();
            console.error('Failed to check profile eligibility:', errorData);
            // Don't throw - allow signup to continue
          }
        } catch (err) {
          console.error('Error checking profile eligibility:', err);
          // Don't throw - allow signup to continue
        }
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setProfile(null);
      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const updateProfile = async (updates) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      // Refresh profile
      await fetchProfile(user.id);
      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const resetPassword = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  // Subscription status helpers
  const subscriptionStatus = profile?.subscription_status || 'inactive';
  const hasActiveProfile = !!profile?.ayr_profile_key && (subscriptionStatus === 'active' || profile?.is_whitelisted);
  const isWhitelisted = profile?.is_whitelisted || false;

  // Determine effective subscription tier
  // Whitelisted users or users with active profiles get treated as AGENCY tier (full access)
  const subscriptionTier = isWhitelisted || hasActiveProfile
    ? (profile?.subscription_tier || SUBSCRIPTION_TIERS.AGENCY)
    : (profile?.subscription_tier || SUBSCRIPTION_TIERS.FREE);

  const workspaceAddOns = profile?.workspace_add_ons || 0; // Track purchased workspace add-ons

  // Tier configuration helpers
  const tierConfig = getTierConfig(subscriptionTier);

  // Feature access helpers
  const hasFeatureAccess = (featureName) => {
    // Whitelisted users get full access
    if (isWhitelisted) return true;

    // If user has active subscription, check their tier
    if (subscriptionStatus === 'active') {
      return hasFeature(subscriptionTier, featureName);
    }

    // If user has an Ayrshare profile key, they have access (backward compatibility)
    if (hasActiveProfile) {
      return hasFeature(subscriptionTier, featureName);
    }

    // For workspace members without personal subscription:
    // Grant feature access (will be restricted by role permissions instead)
    // This prevents workspace members from seeing "upgrade" prompts for features
    // they can use as part of the workspace
    // Features will still be gated by role (e.g., editors can post, clients cannot)
    // Return true to allow access - role permissions will handle the rest
    return true;
  };

  // Tab access helper
  const hasTabAccessCheck = (tabName) => {
    // Whitelisted users get full access
    if (isWhitelisted) return true;

    // If user has active subscription, check their tier
    if (subscriptionStatus === 'active') {
      return hasTabAccess(subscriptionTier, tabName);
    }

    // If user has an Ayrshare profile key, they have access (backward compatibility)
    if (hasActiveProfile) {
      return hasTabAccess(subscriptionTier, tabName);
    }

    // Non-subscribed users without profile: FREE tier restrictions
    return hasTabAccess(SUBSCRIPTION_TIERS.FREE, tabName);
  };

  // Workspace limit helpers
  const canCreateNewWorkspace = (currentWorkspaceCount) => {
    // Whitelisted users can create unlimited
    if (isWhitelisted) return true;

    // Check if subscription is active
    if (subscriptionStatus !== 'active') return false;

    return canCreateWorkspace(subscriptionTier, currentWorkspaceCount, workspaceAddOns);
  };

  const workspaceLimit = getWorkspaceLimit(subscriptionTier, workspaceAddOns);

  // Team member limit helpers
  const canInviteNewMember = (currentMemberCount) => {
    // Whitelisted users can invite unlimited
    if (isWhitelisted) return true;

    // Check if subscription is active
    if (subscriptionStatus !== 'active') return false;

    return canInviteTeamMember(subscriptionTier, currentMemberCount);
  };

  const teamMemberLimit = getTeamMemberLimit(subscriptionTier);

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
    resetPassword,
    refreshProfile: () => user && fetchProfile(user.id),
    // Subscription properties
    subscriptionStatus,
    hasActiveProfile,
    isWhitelisted,
    subscriptionTier,
    tierConfig,
    workspaceAddOns,
    // Feature access helpers
    hasFeatureAccess,
    hasTabAccess: hasTabAccessCheck,
    // Workspace helpers
    canCreateNewWorkspace,
    workspaceLimit,
    // Team helpers
    canInviteNewMember,
    teamMemberLimit,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
