import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { OnboardingTour } from './OnboardingTour';

/**
 * Wrapper component that shows onboarding tour for new users
 * Shows tour when:
 * 1. User has an active subscription (paid)
 * 2. User hasn't completed the in-app tour yet
 */
export const OnboardingWrapper = ({ children }) => {
  const { user, profile, subscriptionStatus, isWhitelisted } = useAuth();
  const [showTour, setShowTour] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Wait for user data to load
    if (!user || !profile) {
      setChecked(true);
      return;
    }

    const shouldShowTour = () => {
      // Only show after payment — active subscription or whitelisted
      const hasPaid = subscriptionStatus === 'active' || isWhitelisted;
      if (!hasPaid) return false;

      // Check localStorage first (faster)
      const localCompleted = localStorage.getItem('woozy_onboarding_completed');
      if (localCompleted === 'true') return false;

      // Check profile for app_tour_completed flag (separate from signup onboarding)
      if (profile.app_tour_completed) return false;

      // Show tour for users who haven't completed it
      return true;
    };

    setShowTour(shouldShowTour());
    setChecked(true);
  }, [user, profile, subscriptionStatus, isWhitelisted]);

  const handleTourComplete = () => {
    setShowTour(false);
  };

  // Don't render anything until we've checked
  if (!checked) return children;

  return (
    <>
      {children}
      {showTour && <OnboardingTour onComplete={handleTourComplete} />}
    </>
  );
};

export default OnboardingWrapper;
