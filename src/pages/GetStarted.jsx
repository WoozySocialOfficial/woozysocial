import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaCheck, FaTimes } from 'react-icons/fa';
import './GetStarted.css';

// Pricing tiers configuration
const PRICING_TIERS = [
  {
    id: 'solo',
    name: 'Solo',
    price: 35,
    currency: '£',
    description: 'Perfect for individuals',
    features: [
      { text: '1 workspace', included: true },
      { text: '1 team member', included: true },
      { text: 'Basic analytics', included: true },
      { text: 'Email support', included: true },
      { text: 'Client approvals', included: false },
    ],
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 50,
    currency: '£',
    description: 'For growing businesses',
    features: [
      { text: '1 workspace', included: true },
      { text: 'Up to 3 members', included: true },
      { text: 'Advanced analytics', included: true },
      { text: 'Priority support', included: true },
      { text: 'Client approvals', included: false },
    ],
    popular: false,
  },
  {
    id: 'pro-plus',
    name: 'Pro Plus',
    price: 115,
    currency: '£',
    description: 'Advanced features for power users',
    features: [
      { text: 'Up to 4 workspaces', included: true },
      { text: 'Unlimited members', included: true },
      { text: 'Full analytics suite', included: true },
      { text: 'Priority support', included: true },
      { text: 'Client approvals', included: true },
    ],
    popular: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 288,
    currency: '£',
    description: 'Complete solution for agencies',
    features: [
      { text: 'Unlimited workspaces', included: true },
      { text: 'Unlimited members', included: true },
      { text: 'Full analytics suite', included: true },
      { text: 'Dedicated support', included: true },
      { text: 'Client portal & approvals', included: true },
    ],
    popular: false,
  },
];

const GetStarted = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    workspaceName: '',
    questionnaireAnswers: {
      goals: [],
      socialAccounts: '',
      teamSize: '',
      workspaces: ''
    },
    selectedTier: '',
    recommendedTier: ''
  });

  // Check URL params for pre-selected plan
  useEffect(() => {
    const plan = searchParams.get('plan');
    if (plan) {
      setFormData(prev => ({ ...prev, selectedTier: plan }));
    }
  }, [searchParams]);

  // Load from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('wizardState');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('Failed to load wizard state:', e);
      }
    }
  }, []);

  // Save to sessionStorage whenever formData changes
  useEffect(() => {
    sessionStorage.setItem('wizardState', JSON.stringify(formData));
  }, [formData]);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const updateQuestionnaireField = (field, value) => {
    setFormData(prev => ({
      ...prev,
      questionnaireAnswers: {
        ...prev.questionnaireAnswers,
        [field]: value
      }
    }));
  };

  const toggleGoal = (goal) => {
    setFormData(prev => {
      const goals = prev.questionnaireAnswers.goals.includes(goal)
        ? prev.questionnaireAnswers.goals.filter(g => g !== goal)
        : [...prev.questionnaireAnswers.goals, goal];
      return {
        ...prev,
        questionnaireAnswers: {
          ...prev.questionnaireAnswers,
          goals
        }
      };
    });
  };

  const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateEmailAvailability = async () => {
    if (!formData.email || !isValidEmail(formData.email)) return;

    try {
      const response = await fetch('/api/onboarding/validate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email })
      });

      const result = await response.json();
      const available = result.data?.available ?? result.available;

      if (!available) {
        setErrors(prev => ({ ...prev, email: 'This email is already registered' }));
      }
    } catch (error) {
      console.error('Email validation error:', error);
    }
  };

  const validateStep1 = () => {
    const newErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    if (!formData.workspaceName.trim()) {
      setErrors({ workspaceName: 'Workspace name is required' });
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (formData.questionnaireAnswers.goals.length === 0) {
      showAlert('Please select at least one goal', 'error');
      return false;
    }
    if (!formData.questionnaireAnswers.socialAccounts) {
      showAlert('Please select how many social accounts you manage', 'error');
      return false;
    }
    if (!formData.questionnaireAnswers.teamSize) {
      showAlert('Please select your team size', 'error');
      return false;
    }
    if (!formData.questionnaireAnswers.workspaces) {
      showAlert('Please select how many workspaces you need', 'error');
      return false;
    }
    return true;
  };

  const validateStep4 = () => {
    if (!formData.selectedTier) {
      showAlert('Please select a plan', 'error');
      return false;
    }
    return true;
  };

  const calculateRecommendedPlan = () => {
    const answers = formData.questionnaireAnswers;
    let score = 0;

    // Goals scoring
    if (answers.goals.includes('manage-brands')) score += 20;
    if (answers.goals.includes('team-collab')) score += 15;
    if (answers.goals.includes('analytics')) score += 10;

    // Social accounts scoring
    if (answers.socialAccounts === '1-3') score += 5;
    if (answers.socialAccounts === '4-10') score += 15;
    if (answers.socialAccounts === '10+') score += 25;

    // Team size scoring
    if (answers.teamSize === 'solo') score += 0;
    if (answers.teamSize === 'small') score += 10;
    if (answers.teamSize === 'medium') score += 20;
    if (answers.teamSize === 'large') score += 25;

    // Workspaces scoring
    if (answers.workspaces === '1') score += 5;
    if (answers.workspaces === '2-4') score += 15;
    if (answers.workspaces === '5+') score += 25;

    // Determine recommended tier
    let recommendedTier;
    if (score <= 15) {
      recommendedTier = 'solo';
    } else if (score <= 30) {
      recommendedTier = 'pro';
    } else if (score <= 50) {
      recommendedTier = 'pro-plus';
    } else {
      recommendedTier = 'agency';
    }

    setFormData(prev => ({ ...prev, recommendedTier }));

    // Pre-select if no plan selected yet
    if (!formData.selectedTier) {
      setFormData(prev => ({ ...prev, selectedTier: recommendedTier }));
    }
  };

  const createAccountAndCheckout = async () => {
    try {
      setLoading(true);
      setCurrentStep(5); // Processing step

      // Create account
      const accountResponse = await fetch('/api/onboarding/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,
          workspaceName: formData.workspaceName,
          questionnaireAnswers: formData.questionnaireAnswers,
          selectedTier: formData.selectedTier
        })
      });

      const accountData = await accountResponse.json();

      if (!accountResponse.ok) {
        throw new Error(accountData.message || 'Failed to create account');
      }

      // Create Stripe checkout session
      const checkoutResponse = await fetch('/api/onboarding/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: accountData.userId,
          workspaceId: accountData.workspaceId,
          tier: formData.selectedTier,
          email: formData.email,
          fullName: formData.fullName
        })
      });

      const checkoutData = await checkoutResponse.json();

      if (!checkoutResponse.ok) {
        throw new Error(checkoutData.message || 'Failed to create checkout session');
      }

      // Move to step 6
      setCurrentStep(6);

      // Redirect to Stripe checkout
      setTimeout(() => {
        window.location.href = checkoutData.checkoutUrl;
      }, 1500);

    } catch (error) {
      console.error('Error:', error);
      showAlert(error.message || 'Something went wrong. Please try again.', 'error');
      setCurrentStep(4); // Go back to plan selection
      setLoading(false);
    }
  };

  const handleNext = async () => {
    clearAlert();
    setErrors({});

    let isValid = false;

    switch (currentStep) {
      case 1:
        isValid = validateStep1();
        break;
      case 2:
        isValid = validateStep2();
        break;
      case 3:
        isValid = validateStep3();
        if (isValid) {
          calculateRecommendedPlan();
        }
        break;
      case 4:
        isValid = validateStep4();
        if (isValid) {
          await createAccountAndCheckout();
          return;
        }
        break;
      default:
        isValid = true;
    }

    if (isValid && currentStep < 6) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const showAlert = (message, type = 'info') => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 5000);
  };

  const clearAlert = () => {
    setAlert(null);
  };

  const planNames = {
    'solo': 'Solo',
    'pro': 'Pro',
    'pro-plus': 'Pro Plus',
    'agency': 'Agency'
  };

  return (
    <div className="get-started-container">
      <div className="get-started-header">
        <h1>Create Your Account</h1>
      </div>

      {/* Progress Bar */}
      <div className="progress-bar">
        {[1, 2, 3, 4, 5, 6].map(step => (
          <div
            key={step}
            className={`progress-step ${step < currentStep ? 'completed' : ''} ${step === currentStep ? 'active' : ''}`}
          >
            {step}
          </div>
        ))}
      </div>

      {/* Alert Container */}
      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.message}
        </div>
      )}

      {/* Step 1: Account Information */}
      {currentStep === 1 && (
        <div className="wizard-step">
          <h2>Let's start with your details</h2>
          <p className="step-subtitle">We'll use this to create your account</p>

          <div className="form-group">
            <label htmlFor="fullName">Full Name *</label>
            <input
              type="text"
              id="fullName"
              placeholder="John Doe"
              value={formData.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
            />
            {errors.fullName && <div className="form-error">{errors.fullName}</div>}
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address *</label>
            <input
              type="email"
              id="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              onBlur={validateEmailAvailability}
            />
            {errors.email && <div className="form-error">{errors.email}</div>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password *</label>
            <input
              type="password"
              id="password"
              placeholder="Minimum 8 characters"
              value={formData.password}
              onChange={(e) => updateField('password', e.target.value)}
            />
            {errors.password && <div className="form-error">{errors.password}</div>}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password *</label>
            <input
              type="password"
              id="confirmPassword"
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
            />
            {errors.confirmPassword && <div className="form-error">{errors.confirmPassword}</div>}
          </div>
        </div>
      )}

      {/* Step 2: Workspace Setup */}
      {currentStep === 2 && (
        <div className="wizard-step">
          <h2>Name your workspace</h2>
          <p className="step-subtitle">This is your brand or company name</p>

          <div className="form-group">
            <label htmlFor="workspaceName">Workspace/Brand Name *</label>
            <input
              type="text"
              id="workspaceName"
              placeholder="My Awesome Brand"
              value={formData.workspaceName}
              onChange={(e) => updateField('workspaceName', e.target.value)}
            />
            {errors.workspaceName && <div className="form-error">{errors.workspaceName}</div>}
          </div>

          <p className="info-text">
            You can create additional workspaces later depending on your plan.
          </p>
        </div>
      )}

      {/* Step 3: Questionnaire */}
      {currentStep === 3 && (
        <div className="wizard-step">
          <h2>Help us recommend the best plan</h2>
          <p className="step-subtitle">Answer a few quick questions</p>

          <div className="form-group">
            <label>What's your primary goal? *</label>
            <div className="checkbox-group">
              {[
                { value: 'schedule-posts', label: 'Schedule and automate social media posts' },
                { value: 'manage-brands', label: 'Manage multiple brands or clients' },
                { value: 'team-collab', label: 'Collaborate with my team' },
                { value: 'analytics', label: 'Track analytics and grow my audience' }
              ].map(goal => (
                <div
                  key={goal.value}
                  className={`checkbox-option ${formData.questionnaireAnswers.goals.includes(goal.value) ? 'selected' : ''}`}
                  onClick={() => toggleGoal(goal.value)}
                >
                  <input
                    type="checkbox"
                    checked={formData.questionnaireAnswers.goals.includes(goal.value)}
                    onChange={() => {}}
                  />
                  <label>{goal.label}</label>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>How many social accounts do you manage? *</label>
            <div className="radio-group">
              {[
                { value: '1-3', label: '1-3 accounts' },
                { value: '4-10', label: '4-10 accounts' },
                { value: '10+', label: '10+ accounts' }
              ].map(option => (
                <div
                  key={option.value}
                  className={`radio-option ${formData.questionnaireAnswers.socialAccounts === option.value ? 'selected' : ''}`}
                  onClick={() => updateQuestionnaireField('socialAccounts', option.value)}
                >
                  <input
                    type="radio"
                    checked={formData.questionnaireAnswers.socialAccounts === option.value}
                    onChange={() => {}}
                  />
                  <label>{option.label}</label>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Do you work with a team? *</label>
            <div className="radio-group">
              {[
                { value: 'solo', label: 'Just me (solo)' },
                { value: 'small', label: 'Small team (2-3 people)' },
                { value: 'medium', label: 'Medium team (4-10 people)' },
                { value: 'large', label: 'Large team (10+ people)' }
              ].map(option => (
                <div
                  key={option.value}
                  className={`radio-option ${formData.questionnaireAnswers.teamSize === option.value ? 'selected' : ''}`}
                  onClick={() => updateQuestionnaireField('teamSize', option.value)}
                >
                  <input
                    type="radio"
                    checked={formData.questionnaireAnswers.teamSize === option.value}
                    onChange={() => {}}
                  />
                  <label>{option.label}</label>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>How many brands/workspaces do you need? *</label>
            <div className="radio-group">
              {[
                { value: '1', label: '1 brand' },
                { value: '2-4', label: '2-4 brands' },
                { value: '5+', label: '5+ brands' }
              ].map(option => (
                <div
                  key={option.value}
                  className={`radio-option ${formData.questionnaireAnswers.workspaces === option.value ? 'selected' : ''}`}
                  onClick={() => updateQuestionnaireField('workspaces', option.value)}
                >
                  <input
                    type="radio"
                    checked={formData.questionnaireAnswers.workspaces === option.value}
                    onChange={() => {}}
                  />
                  <label>{option.label}</label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Plan Selection */}
      {currentStep === 4 && (
        <div className="pricing-selection-step">
          <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Choose your plan</h2>
          {formData.recommendedTier && (
            <p className="step-subtitle" style={{ textAlign: 'center', marginBottom: '2rem' }}>
              Based on your answers, we recommend the <strong>{planNames[formData.recommendedTier]}</strong> plan
            </p>
          )}

          <div className="pricing-grid-signup">
            {PRICING_TIERS.map((tier) => {
              const isSelected = formData.selectedTier === tier.id;
              const isRecommended = formData.recommendedTier === tier.id;

              return (
                <div
                  key={tier.id}
                  className={`pricing-card-signup ${isSelected ? 'selected' : ''} ${tier.popular ? 'popular' : ''} ${isRecommended ? 'recommended' : ''}`}
                  onClick={() => updateField('selectedTier', tier.id)}
                >
                  {tier.popular && <div className="popular-badge">Most Popular</div>}
                  {isRecommended && !tier.popular && <div className="recommended-badge">Recommended</div>}

                  <div className="card-header-signup">
                    <h3>{tier.name}</h3>
                    <p className="tier-description">{tier.description}</p>
                  </div>

                  <div className="price-section-signup">
                    <span className="price">{tier.currency}{tier.price}</span>
                    <span className="period">per month</span>
                  </div>

                  <ul className="features-list-signup">
                    {tier.features.map((feature, index) => (
                      <li key={index} className={feature.included ? 'included' : 'excluded'}>
                        {feature.included ? (
                          <FaCheck className="feature-icon included" />
                        ) : (
                          <FaTimes className="feature-icon excluded" />
                        )}
                        {feature.text}
                      </li>
                    ))}
                  </ul>

                  <div className="select-indicator-signup">
                    {isSelected && <FaCheck className="selected-icon" />}
                    {isSelected ? 'Selected' : 'Select Plan'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 5: Processing */}
      {currentStep === 5 && (
        <div className="wizard-step text-center">
          <h2>Creating your account...</h2>
          <div className="spinner"></div>
          <p className="info-text">
            Please wait while we set everything up for you
          </p>
        </div>
      )}

      {/* Step 6: Stripe Checkout */}
      {currentStep === 6 && (
        <div className="wizard-step text-center">
          <h2>Complete your subscription</h2>
          <p className="step-subtitle">
            Redirecting to secure payment...
          </p>
          <div className="spinner"></div>
        </div>
      )}

      {/* Navigation Buttons */}
      {currentStep < 5 && (
        <div className="wizard-actions">
          {currentStep > 1 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePrev}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleNext}
            disabled={loading}
          >
            {currentStep === 4 ? 'Continue to Payment' : 'Next'}
          </button>
        </div>
      )}
    </div>
  );
};

export default GetStarted;
