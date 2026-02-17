import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { baseURL } from '../utils/constants';
import './OnboardingTour.css';

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Woozy Social!',
    description: 'Let\'s take a quick tour to help you get started with your dashboard. This will only take a minute.',
    icon: '👋',
    route: '/dashboard',
    target: null, // Centered card, no spotlight
    position: 'center'
  },
  {
    id: 'sidebar',
    title: 'Your Navigation',
    description: 'Use the sidebar to navigate between pages — Dashboard, Compose, Schedule, Team, and more.',
    icon: '📋',
    route: '/dashboard',
    target: '.sidebar',
    position: 'right'
  },
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    description: 'Your command center. See posting stats, recent activity, and quick actions all in one place.',
    icon: '📊',
    route: '/dashboard',
    target: '.dashboard-stats',
    position: 'bottom'
  },
  {
    id: 'connect',
    title: 'Connect Your Socials',
    description: 'Click your profile avatar here to find "Connect Social Accounts" — link Instagram, Twitter, LinkedIn, and more.',
    icon: '🔗',
    route: '/dashboard',
    target: '.profile-avatar',
    position: 'bottom-left'
  },
  {
    id: 'compose',
    title: 'Create Your First Post',
    description: 'This is where you write posts, add media, preview how they\'ll look on each platform, and get AI-powered suggestions.',
    icon: '✍️',
    route: '/compose',
    target: '.compose-content',
    position: 'top'
  },
  {
    id: 'schedule',
    title: 'Schedule & Calendar',
    description: 'View your content calendar, plan posts for the best times, and manage your posting schedule.',
    icon: '📅',
    route: '/schedule',
    target: '.schedule-container',
    position: 'top'
  },
  {
    id: 'team',
    title: 'Invite Your Team',
    description: 'On Pro plans and above, invite team members to collaborate on content creation and approvals.',
    icon: '👥',
    route: '/team',
    target: '.team-content',
    position: 'top'
  },
  {
    id: 'done',
    title: 'You\'re All Set!',
    description: 'That\'s the basics! You can replay this tour anytime from Settings. Now go create something amazing!',
    icon: '🎉',
    route: null,
    target: null,
    position: 'center'
  }
];

// Padding around the spotlight hole
const SPOTLIGHT_PADDING = 12;
// Gap between spotlight and tooltip
const TOOLTIP_GAP = 16;

export const OnboardingTour = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [spotlightRect, setSpotlightRect] = useState(null);
  const [tooltipStyle, setTooltipStyle] = useState({});
  const [isTransitioning, setIsTransitioning] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const tooltipRef = useRef(null);
  const resizeTimerRef = useRef(null);

  const step = TOUR_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;
  const hasTarget = step.target !== null;

  // Find and measure the target element
  const measureTarget = useCallback(() => {
    if (!step.target) {
      setSpotlightRect(null);
      setTooltipStyle({ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
      return;
    }

    const el = document.querySelector(step.target);
    if (!el) {
      // Target not found — fall back to centered
      setSpotlightRect(null);
      setTooltipStyle({ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
      return;
    }

    const rect = el.getBoundingClientRect();
    const padded = {
      top: rect.top - SPOTLIGHT_PADDING,
      left: rect.left - SPOTLIGHT_PADDING,
      width: rect.width + SPOTLIGHT_PADDING * 2,
      height: rect.height + SPOTLIGHT_PADDING * 2,
      bottom: rect.bottom + SPOTLIGHT_PADDING,
      right: rect.right + SPOTLIGHT_PADDING
    };

    setSpotlightRect(padded);

    // Scroll element into view if needed
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [step.target]);

  // Position the tooltip relative to the spotlight
  useEffect(() => {
    if (!spotlightRect || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pos = step.position;
    let style = { position: 'fixed' };

    if (pos === 'right') {
      // To the right of the spotlight
      style.left = Math.min(spotlightRect.left + spotlightRect.width + TOOLTIP_GAP, vw - tooltipRect.width - 16);
      style.top = spotlightRect.top + spotlightRect.height / 2 - tooltipRect.height / 2;
    } else if (pos === 'bottom' || pos === 'bottom-left') {
      // Below the spotlight
      style.top = spotlightRect.top + spotlightRect.height + TOOLTIP_GAP;
      if (pos === 'bottom-left') {
        style.right = vw - spotlightRect.right;
      } else {
        style.left = spotlightRect.left + spotlightRect.width / 2 - tooltipRect.width / 2;
      }
    } else if (pos === 'top') {
      // Above the spotlight
      style.top = spotlightRect.top - tooltipRect.height - TOOLTIP_GAP;
      style.left = spotlightRect.left + spotlightRect.width / 2 - tooltipRect.width / 2;
    } else if (pos === 'left') {
      style.right = vw - spotlightRect.left + TOOLTIP_GAP;
      style.top = spotlightRect.top + spotlightRect.height / 2 - tooltipRect.height / 2;
    }

    // Clamp to viewport
    if (style.left !== undefined) {
      style.left = Math.max(16, Math.min(style.left, vw - tooltipRect.width - 16));
    }
    if (style.top !== undefined) {
      style.top = Math.max(16, Math.min(style.top, vh - tooltipRect.height - 16));
    }

    setTooltipStyle(style);
  }, [spotlightRect, step.position, currentStep]);

  // Navigate to the correct route and measure target after DOM settles
  useEffect(() => {
    if (!isVisible) return;

    const targetRoute = step.route;
    if (targetRoute && location.pathname !== targetRoute) {
      navigate(targetRoute);
    }

    // Wait for page to render, then measure
    const timer = setTimeout(() => {
      measureTarget();
      setIsTransitioning(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [currentStep, isVisible, step.route, location.pathname, navigate, measureTarget]);

  // Re-measure on window resize
  useEffect(() => {
    const handleResize = () => {
      clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(measureTarget, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimerRef.current);
    };
  }, [measureTarget]);

  const goToStep = (nextIndex) => {
    setIsTransitioning(true);
    setSpotlightRect(null);
    setCurrentStep(nextIndex);
  };

  const handleNext = () => {
    if (isLastStep) {
      completeTour();
    } else {
      goToStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      goToStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    completeTour();
  };

  const completeTour = async () => {
    setIsVisible(false);

    // Navigate back to dashboard
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

    if (onComplete) {
      onComplete();
    }
  };

  if (!isVisible) return null;

  return (
    <div className="tour-overlay">
      {/* Dark backdrop — if we have a spotlight, cut a hole; otherwise full overlay */}
      {hasTarget && spotlightRect ? (
        <div
          className="tour-spotlight"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
            borderRadius: '12px'
          }}
        />
      ) : (
        <div className="tour-backdrop" />
      )}

      {/* Click blocker on the overlay area (not the spotlight hole) */}
      <div className="tour-click-blocker" onClick={(e) => e.stopPropagation()} />

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className={`tour-tooltip ${hasTarget ? 'tour-tooltip--anchored' : 'tour-tooltip--centered'} ${isTransitioning ? 'tour-tooltip--transitioning' : ''}`}
        style={tooltipStyle}
      >
        {/* Progress bar */}
        <div className="tour-progress">
          <div className="tour-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="tour-tooltip-body">
          {/* Step indicator */}
          <div className="tour-step-indicator">
            Step {currentStep + 1} of {TOUR_STEPS.length}
          </div>

          {/* Icon + Content */}
          <div className="tour-content">
            <span className="tour-icon">{step.icon}</span>
            <h3 className="tour-title">{step.title}</h3>
            <p className="tour-description">{step.description}</p>
          </div>

          {/* Navigation dots */}
          <div className="tour-dots">
            {TOUR_STEPS.map((_, index) => (
              <button
                key={index}
                className={`tour-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
                onClick={() => goToStep(index)}
                aria-label={`Go to step ${index + 1}`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="tour-actions">
            {!isFirstStep && (
              <button className="tour-btn tour-btn--secondary" onClick={handlePrev}>
                Back
              </button>
            )}
            {isFirstStep && (
              <button className="tour-btn tour-btn--secondary" onClick={handleSkip}>
                Skip Tour
              </button>
            )}
            <button className="tour-btn tour-btn--primary" onClick={handleNext}>
              {isLastStep ? 'Get Started' : 'Next'}
            </button>
          </div>

          {/* Skip link */}
          {!isLastStep && !isFirstStep && (
            <button className="tour-skip-link" onClick={handleSkip}>
              Skip tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
