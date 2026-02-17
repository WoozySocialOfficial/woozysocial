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
    target: null,
  },
  {
    id: 'sidebar',
    title: 'Your Navigation',
    description: 'Use the sidebar to navigate between pages — Dashboard, Compose, Schedule, Team, and more.',
    icon: '📋',
    route: '/dashboard',
    target: '.sidebar-menu',
  },
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    description: 'Your command center. See posting stats, recent activity, and quick actions all in one place.',
    icon: '📊',
    route: '/dashboard',
    target: '.dashboard-stats',
  },
  {
    id: 'quick-actions',
    title: 'Quick Actions',
    description: 'Jump straight into creating a new post, scheduling content, or setting up your brand profile.',
    icon: '⚡',
    route: '/dashboard',
    target: '.quick-actions-section',
  },
  {
    id: 'connect',
    title: 'Connect Your Socials',
    description: 'Click your profile avatar here to find "Connect Social Accounts" — link Instagram, Twitter, LinkedIn, and more.',
    icon: '🔗',
    route: '/dashboard',
    target: '.profile-avatar',
  },
  {
    id: 'compose',
    title: 'Create Your First Post',
    description: 'Write posts, add media, preview how they\'ll look on each platform, and get AI-powered suggestions.',
    icon: '✍️',
    route: '/compose',
    target: '.compose-header',
  },
  {
    id: 'schedule',
    title: 'Schedule & Calendar',
    description: 'View your content calendar, plan posts for the best times, and manage your posting schedule.',
    icon: '📅',
    route: '/schedule',
    target: '.schedule-header',
  },
  {
    id: 'team',
    title: 'Invite Your Team',
    description: 'On Pro plans and above, invite team members to collaborate on content creation and approvals.',
    icon: '👥',
    route: '/team',
    target: '.team-header',
  },
  {
    id: 'done',
    title: 'You\'re All Set!',
    description: 'That\'s the basics! You can replay this tour anytime from your profile menu. Now go create something amazing!',
    icon: '🎉',
    route: null,
    target: null,
  }
];

const SPOTLIGHT_PADDING = 10;
const TOOLTIP_GAP = 14;
const VIEWPORT_MARGIN = 16;

/**
 * Auto-calculate the best position for the tooltip so it never overlaps the spotlight.
 * Tries: bottom, right, top, left — picks whichever has the most space.
 */
function calcBestPosition(spotRect, tooltipW, tooltipH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spaceBottom = vh - spotRect.top - spotRect.height - TOOLTIP_GAP;
  const spaceTop = spotRect.top - TOOLTIP_GAP;
  const spaceRight = vw - spotRect.left - spotRect.width - TOOLTIP_GAP;
  const spaceLeft = spotRect.left - TOOLTIP_GAP;

  // Score each side by how well the tooltip fits
  const sides = [
    { side: 'bottom', fits: spaceBottom >= tooltipH, space: spaceBottom },
    { side: 'right',  fits: spaceRight >= tooltipW,  space: spaceRight },
    { side: 'top',    fits: spaceTop >= tooltipH,    space: spaceTop },
    { side: 'left',   fits: spaceLeft >= tooltipW,   space: spaceLeft },
  ];

  // Prefer a side where it fits; among those, prefer bottom > right > top > left
  const fitting = sides.filter(s => s.fits);
  const chosen = fitting.length > 0 ? fitting[0] : sides.sort((a, b) => b.space - a.space)[0];

  let top, left;

  switch (chosen.side) {
    case 'bottom':
      top = spotRect.top + spotRect.height + TOOLTIP_GAP;
      left = spotRect.left + spotRect.width / 2 - tooltipW / 2;
      break;
    case 'top':
      top = spotRect.top - tooltipH - TOOLTIP_GAP;
      left = spotRect.left + spotRect.width / 2 - tooltipW / 2;
      break;
    case 'right':
      top = spotRect.top + spotRect.height / 2 - tooltipH / 2;
      left = spotRect.left + spotRect.width + TOOLTIP_GAP;
      break;
    case 'left':
      top = spotRect.top + spotRect.height / 2 - tooltipH / 2;
      left = spotRect.left - tooltipW - TOOLTIP_GAP;
      break;
    default:
      top = spotRect.top + spotRect.height + TOOLTIP_GAP;
      left = spotRect.left + spotRect.width / 2 - tooltipW / 2;
  }

  // Clamp to viewport
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - tooltipW - VIEWPORT_MARGIN));
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - tooltipH - VIEWPORT_MARGIN));

  return { top, left, side: chosen.side };
}

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
      setSpotlightRect(null);
      setTooltipStyle({ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
      return;
    }

    const rect = el.getBoundingClientRect();
    const padded = {
      top: Math.max(0, rect.top - SPOTLIGHT_PADDING),
      left: Math.max(0, rect.left - SPOTLIGHT_PADDING),
      width: rect.width + SPOTLIGHT_PADDING * 2,
      height: rect.height + SPOTLIGHT_PADDING * 2,
    };
    padded.bottom = padded.top + padded.height;
    padded.right = padded.left + padded.width;

    setSpotlightRect(padded);

    // Scroll element into view if needed
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [step.target]);

  // Position the tooltip using auto-positioning
  useEffect(() => {
    if (!spotlightRect || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tRect = tooltip.getBoundingClientRect();
    const { top, left } = calcBestPosition(spotlightRect, tRect.width, tRect.height);

    setTooltipStyle({ position: 'fixed', top, left });
  }, [spotlightRect, currentStep]);

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

      <div className="tour-click-blocker" onClick={(e) => e.stopPropagation()} />

      <div
        ref={tooltipRef}
        className={`tour-tooltip ${hasTarget ? 'tour-tooltip--anchored' : 'tour-tooltip--centered'} ${isTransitioning ? 'tour-tooltip--transitioning' : ''}`}
        style={tooltipStyle}
      >
        <div className="tour-progress">
          <div className="tour-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="tour-tooltip-body">
          <div className="tour-step-indicator">
            Step {currentStep + 1} of {TOUR_STEPS.length}
          </div>

          <div className="tour-content">
            <span className="tour-icon">{step.icon}</span>
            <h3 className="tour-title">{step.title}</h3>
            <p className="tour-description">{step.description}</p>
          </div>

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
