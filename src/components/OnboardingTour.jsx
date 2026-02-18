import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { baseURL } from '../utils/constants';
import './OnboardingTour.css';

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Woozy Social!',
    description: 'Let\'s take a quick tour to help you get started. This will only take a minute.',
    icon: '👋',
    action: null
  },
  {
    id: 'dashboard',
    title: 'Your Dashboard',
    description: 'This is your command center. See your posting stats, recent activity, and quick actions all in one place.',
    icon: '📊',
    action: '/dashboard'
  },
  {
    id: 'connect',
    title: 'Connect Your Socials',
    description: 'Click your profile in the top right, then "Connect Social Accounts" to link your Instagram, Twitter, LinkedIn, and more.',
    icon: '🔗',
    action: null
  },
  {
    id: 'compose',
    title: 'Create Your First Post',
    description: 'Go to Compose to write posts, add media, preview how they\'ll look on each platform, and get AI-powered suggestions.',
    icon: '✍️',
    action: '/compose'
  },
  {
    id: 'schedule',
    title: 'Schedule Posts',
    description: 'Use the Schedule page to see your content calendar and plan posts for the best times to reach your audience.',
    icon: '📅',
    action: '/schedule'
  },
  {
    id: 'team',
    title: 'Invite Your Team',
    description: 'On Pro plans and above, invite team members to collaborate on content. Go to Team to send invites.',
    icon: '👥',
    action: '/team'
  },
  {
    id: 'done',
    title: 'You\'re All Set!',
    description: 'That\'s the basics! You can replay this tour anytime from Settings. Now go create something amazing!',
    icon: '🎉',
    action: null
  }
];

export const OnboardingTour = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  const step = TOUR_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  const handleNext = () => {
    if (isLastStep) {
      completeTour();
    } else {
      const nextStep = TOUR_STEPS[currentStep + 1];
      if (nextStep.action) {
        navigate(nextStep.action);
      }
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      const prevStep = TOUR_STEPS[currentStep - 1];
      if (prevStep.action) {
        navigate(prevStep.action);
      }
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    completeTour();
  };

  const completeTour = async () => {
    setIsVisible(false);

    // Mark app tour as completed in the database
    if (user) {
      try {
        await fetch(`${baseURL}/api/user/update-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            updates: { app_tour_completed: true }
          })
        });
      } catch (error) {
        console.error('Failed to mark app tour complete:', error);
      }
    }

    // Also save to localStorage as backup
    localStorage.setItem('woozy_onboarding_completed', 'true');

    if (onComplete) {
      onComplete();
    }
  };

  if (!isVisible) return null;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        {/* Progress bar */}
        <div className="onboarding-progress">
          <div
            className="onboarding-progress-bar"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step indicator */}
        <div className="onboarding-step-indicator">
          Step {currentStep + 1} of {TOUR_STEPS.length}
        </div>

        {/* Content */}
        <div className="onboarding-content">
          <div className="onboarding-icon">{step.icon}</div>
          <h2 className="onboarding-title">{step.title}</h2>
          <p className="onboarding-description">{step.description}</p>
        </div>

        {/* Navigation dots */}
        <div className="onboarding-dots">
          {TOUR_STEPS.map((_, index) => (
            <button
              key={index}
              className={`onboarding-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              onClick={() => setCurrentStep(index)}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="onboarding-actions">
          {!isFirstStep && (
            <button className="onboarding-btn secondary" onClick={handlePrev}>
              Back
            </button>
          )}
          {isFirstStep && (
            <button className="onboarding-btn secondary" onClick={handleSkip}>
              Skip Tour
            </button>
          )}
          <button className="onboarding-btn primary" onClick={handleNext}>
            {isLastStep ? 'Get Started' : 'Next'}
          </button>
        </div>

        {/* Skip link (not on last step) */}
        {!isLastStep && !isFirstStep && (
          <button className="onboarding-skip-link" onClick={handleSkip}>
            Skip tour
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingTour;
