import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { baseURL } from '../utils/constants';
import './OnboardingTour.css';

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Woozy Social',
    description: 'Let\'s walk you through the key areas of your dashboard. Click through each step or expand any section to learn more.',
    icon: '👋',
    route: '/dashboard',
  },
  {
    id: 'sidebar',
    title: 'Sidebar Navigation',
    description: 'Use the sidebar on the left to jump between pages — Dashboard, Compose, Schedule, Posts, Team, and more. It\'s your main way to get around.',
    icon: '📋',
    route: '/dashboard',
  },
  {
    id: 'dashboard',
    title: 'Dashboard & Stats',
    description: 'Your command center. See posting stats at a glance — how many posts are scheduled, published, and your overall activity. Quick actions let you jump straight into creating content.',
    icon: '📊',
    route: '/dashboard',
  },
  {
    id: 'connect',
    title: 'Connect Your Socials',
    description: 'Click your profile avatar in the top right corner, then select "Connect Social Accounts" to link Instagram, Twitter/X, LinkedIn, TikTok, YouTube, Pinterest and more.',
    icon: '🔗',
    route: '/dashboard',
  },
  {
    id: 'compose',
    title: 'Create & Compose Posts',
    description: 'Write your content, add images or videos, select which platforms to post to, and preview how your post will look on each network. You can also use AI to help generate content.',
    icon: '✍️',
    route: '/compose',
  },
  {
    id: 'schedule',
    title: 'Schedule & Calendar',
    description: 'View your content calendar in week, month, or list view. Schedule posts for the best times to reach your audience. Drag and drop to reschedule.',
    icon: '📅',
    route: '/schedule',
  },
  {
    id: 'team',
    title: 'Team & Collaboration',
    description: 'On Pro plans and above, invite team members to collaborate. Set roles and permissions, use the approval workflow, and manage your content team.',
    icon: '👥',
    route: '/team',
  },
  {
    id: 'done',
    title: 'You\'re All Set!',
    description: 'That covers the basics! You can replay this tour anytime from your profile menu. Now go create something amazing — your audience is waiting!',
    icon: '🎉',
    route: '/dashboard',
  }
];

export const OnboardingTour = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [expandedStep, setExpandedStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  // Navigate to step's route when current step changes
  useEffect(() => {
    if (!isVisible) return;
    const step = TOUR_STEPS[currentStep];
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
    setExpandedStep(currentStep);
  }, [currentStep, isVisible, navigate, location.pathname]);

  const handleStepClick = (index) => {
    if (expandedStep === index) {
      // Clicking the already expanded step collapses it
      setExpandedStep(-1);
    } else {
      setExpandedStep(index);
      setCurrentStep(index);
      // Navigate to that step's page
      const step = TOUR_STEPS[index];
      if (step.route && location.pathname !== step.route) {
        navigate(step.route);
      }
    }
  };

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      completeTour();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const completeTour = async () => {
    setIsClosing(true);

    // Small delay for close animation
    setTimeout(async () => {
      setIsVisible(false);
      navigate('/dashboard');

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

      localStorage.setItem('woozy_onboarding_completed', 'true');
      if (onComplete) onComplete();
    }, 250);
  };

  if (!isVisible) return null;

  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <>
      {/* Subtle dimmed backdrop */}
      <div className="tour-dim" onClick={completeTour} />

      {/* Dropdown panel */}
      <div className={`tour-panel ${isClosing ? 'tour-panel--closing' : ''}`}>
        {/* Header */}
        <div className="tour-panel-header">
          <div className="tour-panel-header-left">
            <span className="tour-panel-logo">🚀</span>
            <span className="tour-panel-title">Getting Started</span>
          </div>
          <button className="tour-panel-close" onClick={completeTour} aria-label="Close tour">
            ✕
          </button>
        </div>

        {/* Progress */}
        <div className="tour-panel-progress">
          <div className="tour-panel-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        {/* Steps list */}
        <div className="tour-panel-steps">
          {TOUR_STEPS.map((step, index) => {
            const isActive = index === currentStep;
            const isExpanded = index === expandedStep;
            const isCompleted = index < currentStep;

            return (
              <div
                key={step.id}
                className={`tour-step ${isActive ? 'tour-step--active' : ''} ${isCompleted ? 'tour-step--completed' : ''} ${isExpanded ? 'tour-step--expanded' : ''}`}
              >
                <button
                  className="tour-step-header"
                  onClick={() => handleStepClick(index)}
                >
                  <div className="tour-step-indicator">
                    {isCompleted ? (
                      <span className="tour-step-check">✓</span>
                    ) : (
                      <span className="tour-step-number">{index + 1}</span>
                    )}
                  </div>
                  <div className="tour-step-label">
                    <span className="tour-step-icon">{step.icon}</span>
                    <span className="tour-step-name">{step.title}</span>
                  </div>
                  <span className={`tour-step-chevron ${isExpanded ? 'tour-step-chevron--open' : ''}`}>
                    ▾
                  </span>
                </button>

                {isExpanded && (
                  <div className="tour-step-body">
                    <p className="tour-step-description">{step.description}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer navigation */}
        <div className="tour-panel-footer">
          {!isFirstStep && (
            <button className="tour-btn tour-btn--secondary" onClick={handlePrev}>
              Back
            </button>
          )}
          {isFirstStep && (
            <button className="tour-btn tour-btn--secondary" onClick={completeTour}>
              Skip
            </button>
          )}
          <button className="tour-btn tour-btn--primary" onClick={handleNext}>
            {isLastStep ? 'Finish Tour' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
};

export default OnboardingTour;
