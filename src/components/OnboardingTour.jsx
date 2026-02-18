import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { baseURL } from '../utils/constants';
import './OnboardingTour.css';

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Woozy Social!',
    description: "Let's take a quick tour to help you get started. We'll show you around the app!",
    icon: '👋',
    route: '/dashboard',
    target: null
  },
  {
    id: 'sidebar',
    title: 'Navigation',
    description: 'Use the sidebar to navigate between all sections of the app — Dashboard, Compose, Schedule, and more.',
    icon: '📱',
    route: '/dashboard',
    target: '.sidebar-menu'
  },
  {
    id: 'dashboard',
    title: 'Your Dashboard',
    description: 'This is your command center. See posting stats, recent activity, and quick actions at a glance.',
    icon: '📊',
    route: '/dashboard',
    target: '.dashboard-stats'
  },
  {
    id: 'quick-actions',
    title: 'Quick Actions',
    description: 'Use these shortcuts to quickly compose posts, view your schedule, or manage your team.',
    icon: '⚡',
    route: '/dashboard',
    target: '.quick-actions-grid'
  },
  {
    id: 'connect',
    title: 'Connect Your Socials',
    description: 'Click your profile in the top right, then "Connect Social Accounts" to link Instagram, Twitter, LinkedIn, and more.',
    icon: '🔗',
    route: '/dashboard',
    target: '.header-right'
  },
  {
    id: 'compose',
    title: 'Create Your First Post',
    description: 'Write your posts here. Add text, hashtags, and craft the perfect message for your audience.',
    icon: '✍️',
    route: '/compose',
    target: '.compose-textarea'
  },
  {
    id: 'compose-platforms',
    title: 'Choose Platforms',
    description: 'Select which social platforms to post to. Connect accounts first to see them here.',
    icon: '📲',
    route: '/compose',
    target: '.compose-socials'
  },
  {
    id: 'compose-post',
    title: 'Post or Schedule',
    description: 'When ready, hit Post to publish immediately or set a date to schedule it for later.',
    icon: '🚀',
    route: '/compose',
    target: '.btn-post'
  },
  {
    id: 'schedule',
    title: 'Your Schedule',
    description: 'See your content calendar here. View scheduled posts and plan the best times to reach your audience.',
    icon: '📅',
    route: '/schedule',
    target: '.schedule-controls'
  },
  {
    id: 'team',
    title: 'Invite Your Team',
    description: 'On Pro plans and above, invite team members to collaborate on content creation and approvals.',
    icon: '👥',
    route: '/team',
    target: '.add-member-button'
  },
  {
    id: 'done',
    title: "You're All Set!",
    description: "That's the basics! You can replay this tour anytime from your profile menu. Now go create something amazing!",
    icon: '🎉',
    route: null,
    target: null
  }
];

export const OnboardingTour = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [spotlightRect, setSpotlightRect] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0, placement: 'bottom' });
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const tooltipRef = useRef(null);
  const measureTimer = useRef(null);

  const step = TOUR_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  // Measure target element and compute spotlight + tooltip positions
  const measureTarget = useCallback(() => {
    if (!step.target) {
      setSpotlightRect(null);
      return;
    }

    const el = document.querySelector(step.target);
    if (!el) {
      setSpotlightRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    const pad = 8;
    const spot = {
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2
    };
    setSpotlightRect(spot);

    // Calculate best tooltip position
    requestAnimationFrame(() => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;

      const tw = tooltip.offsetWidth || 340;
      const th = tooltip.offsetHeight || 200;
      const gap = 16;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Try bottom first, then right, then top, then left
      const positions = [
        {
          placement: 'bottom',
          top: spot.top + spot.height + gap,
          left: spot.left + spot.width / 2 - tw / 2,
          fits: spot.top + spot.height + gap + th < vh
        },
        {
          placement: 'right',
          top: spot.top + spot.height / 2 - th / 2,
          left: spot.left + spot.width + gap,
          fits: spot.left + spot.width + gap + tw < vw
        },
        {
          placement: 'top',
          top: spot.top - th - gap,
          left: spot.left + spot.width / 2 - tw / 2,
          fits: spot.top - th - gap > 0
        },
        {
          placement: 'left',
          top: spot.top + spot.height / 2 - th / 2,
          left: spot.left - tw - gap,
          fits: spot.left - tw - gap > 0
        }
      ];

      let best = positions.find(p => p.fits) || positions[0];

      // Clamp to viewport
      best.top = Math.max(10, Math.min(best.top, vh - th - 10));
      best.left = Math.max(10, Math.min(best.left, vw - tw - 10));

      setTooltipPos({ top: best.top, left: best.left, placement: best.placement });
    });
  }, [step.target]);

  // Navigate to the step's route if needed, then measure
  useEffect(() => {
    if (!isVisible) return;

    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
      // Wait for route change + render
      measureTimer.current = setTimeout(measureTarget, 400);
    } else {
      measureTimer.current = setTimeout(measureTarget, 200);
    }

    return () => {
      if (measureTimer.current) clearTimeout(measureTimer.current);
    };
  }, [currentStep, isVisible, step.route, location.pathname, navigate, measureTarget]);

  // Re-measure on window resize
  useEffect(() => {
    if (!isVisible) return;
    const handleResize = () => measureTarget();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isVisible, measureTarget]);

  const handleNext = () => {
    if (isLastStep) {
      completeTour();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    completeTour();
  };

  const completeTour = async () => {
    setIsVisible(false);

    // Navigate back to dashboard on completion
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

  const hasSpotlight = !!spotlightRect && !!step.target;

  return (
    <div className="tour-overlay">
      {/* Click blocker - covers everything except spotlight */}
      <div className="tour-click-blocker" />

      {/* Spotlight highlight */}
      {hasSpotlight && (
        <div
          className="tour-spotlight"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={`tour-tooltip ${hasSpotlight ? `tour-tooltip--${tooltipPos.placement}` : 'tour-tooltip--center'}`}
        style={hasSpotlight ? { top: tooltipPos.top, left: tooltipPos.left } : {}}
      >
        {/* Progress bar */}
        <div className="tour-progress">
          <div className="tour-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="tour-step-indicator">
          Step {currentStep + 1} of {TOUR_STEPS.length}
        </div>

        <div className="tour-content">
          <div className="tour-icon">{step.icon}</div>
          <h3 className="tour-title">{step.title}</h3>
          <p className="tour-description">{step.description}</p>
        </div>

        {/* Navigation dots */}
        <div className="tour-dots">
          {TOUR_STEPS.map((_, index) => (
            <span
              key={index}
              className={`tour-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="tour-actions">
          {!isFirstStep && (
            <button className="tour-btn secondary" onClick={handlePrev}>
              Back
            </button>
          )}
          {isFirstStep && (
            <button className="tour-btn secondary" onClick={handleSkip}>
              Skip Tour
            </button>
          )}
          <button className="tour-btn primary" onClick={handleNext}>
            {isLastStep ? "Let's Go!" : 'Next'}
          </button>
        </div>

        {/* Skip link */}
        {!isLastStep && !isFirstStep && (
          <button className="tour-skip-link" onClick={handleSkip}>
            Skip tour
          </button>
        )}

        {/* Arrow pointer */}
        {hasSpotlight && (
          <div className={`tour-arrow tour-arrow--${tooltipPos.placement}`} />
        )}
      </div>
    </div>
  );
};

export default OnboardingTour;
