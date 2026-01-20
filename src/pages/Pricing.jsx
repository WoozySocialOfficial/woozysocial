import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { baseURL } from '../utils/constants';
import { loadStripe } from '@stripe/stripe-js';
import { FaCheck, FaTimes, FaSpinner } from 'react-icons/fa';
import { PricingSEO } from '../components/SEO';
import './Pricing.css';

// Initialize Stripe - this will be loaded lazily
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Pricing tiers configuration
const PRICING_TIERS = [
  {
    id: 'solo',
    name: 'Solo',
    monthlyPrice: 35,
    annualPrice: 350, // 2 months free (35 * 10)
    currency: 'GBP',
    description: 'Perfect for individuals and content creators',
    features: [
      { text: '1 social profile', included: true },
      { text: '50 scheduled posts/month', included: true },
      { text: 'Basic analytics', included: true },
      { text: 'Email support', included: true },
      { text: 'Team collaboration', included: false },
      { text: 'Client approvals', included: false },
      { text: 'White label', included: false },
    ],
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 50,
    annualPrice: 500, // 2 months free (50 * 10)
    currency: 'GBP',
    description: 'For growing businesses and marketers',
    features: [
      { text: '3 social profiles', included: true },
      { text: '150 scheduled posts/month', included: true },
      { text: 'Advanced analytics', included: true },
      { text: 'Priority email support', included: true },
      { text: 'Team collaboration (2 users)', included: true },
      { text: 'Client approvals', included: false },
      { text: 'White label', included: false },
    ],
    popular: false,
  },
  {
    id: 'pro-plus',
    name: 'Pro Plus',
    monthlyPrice: 115,
    annualPrice: 1150, // 2 months free (115 * 10)
    currency: 'GBP',
    description: 'Advanced features for power users',
    features: [
      { text: '5 social profiles', included: true },
      { text: 'Unlimited scheduled posts', included: true },
      { text: 'Advanced analytics & reports', included: true },
      { text: 'Priority support', included: true },
      { text: 'Team collaboration (5 users)', included: true },
      { text: 'Client approvals', included: true },
      { text: 'White label', included: false },
    ],
    popular: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    monthlyPrice: 288,
    annualPrice: 2880, // 2 months free (288 * 10)
    currency: 'GBP',
    description: 'Complete solution for agencies',
    features: [
      { text: '15 social profiles', included: true },
      { text: 'Unlimited scheduled posts', included: true },
      { text: 'Full analytics suite', included: true },
      { text: 'Dedicated support', included: true },
      { text: 'Team collaboration (15 users)', included: true },
      { text: 'Client approvals & portal', included: true },
      { text: 'White label branding', included: true },
    ],
    popular: false,
  },
  {
    id: 'brand-bolt',
    name: 'BrandBolt',
    monthlyPrice: 25,
    annualPrice: 250, // 2 months free (25 * 10)
    currency: 'GBP',
    description: 'Starter plan for brand building',
    features: [
      { text: '1 social profile', included: true },
      { text: '30 scheduled posts/month', included: true },
      { text: 'Basic analytics', included: true },
      { text: 'Email support', included: true },
      { text: 'Team collaboration', included: false },
      { text: 'Client approvals', included: false },
      { text: 'White label', included: false },
    ],
    popular: false,
  },
];

export const Pricing = () => {
  const { user, profile, subscriptionStatus, subscriptionTier, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [billingPeriod, setBillingPeriod] = useState('monthly'); // 'monthly' or 'annual'

  // Check for payment result from URL params
  const paymentStatus = searchParams.get('payment');
  const isPaymentSuccess = paymentStatus === 'success';
  const isPaymentCancelled = paymentStatus === 'cancelled';

  // Refresh profile if payment was successful
  React.useEffect(() => {
    if (isPaymentSuccess && refreshProfile) {
      refreshProfile();
    }
  }, [isPaymentSuccess, refreshProfile]);

  const handleSelectPlan = async (tierId) => {
    if (!user) {
      navigate('/login?redirect=/pricing');
      return;
    }

    // If already subscribed to this tier
    if (subscriptionTier === tierId && subscriptionStatus === 'active') {
      return;
    }

    setLoading(tierId);
    setError(null);

    try {
      console.log('[PRICING] Creating checkout with:', {
        userId: user.id,
        tier: tierId,
        billingPeriod: billingPeriod
      });

      const response = await fetch(`${baseURL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          tier: tierId,
          billingPeriod: billingPeriod, // Pass the selected billing period
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      if (data.data?.url) {
        window.location.href = data.data.url;
      } else {
        // Fallback to client-side redirect
        const stripe = await stripePromise;
        const { error: stripeError } = await stripe.redirectToCheckout({
          sessionId: data.data.sessionId,
        });
        if (stripeError) {
          throw stripeError;
        }
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) {
      console.error('[PRICING] No user found');
      return;
    }

    console.log('[PRICING] Opening billing portal for user:', user.id);
    setLoading('manage');
    setError(null);

    try {
      const response = await fetch(`${baseURL}/api/stripe/customer-portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          returnUrl: `${window.location.origin}/pricing`,
        }),
      });

      const data = await response.json();
      console.log('[PRICING] Portal response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to open billing portal');
      }

      if (data.data?.url) {
        console.log('[PRICING] Redirecting to portal:', data.data.url);
        window.location.href = data.data.url;
      } else {
        throw new Error('No portal URL received');
      }
    } catch (err) {
      console.error('[PRICING] Portal error:', err);
      setError(`Unable to open billing portal: ${err.message}`);
    } finally {
      setLoading(null);
    }
  };

  const formatPrice = (price, currency) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(price);
  };

  return (
    <>
      <PricingSEO />
      <div className="pricing-page">
        <div className="pricing-header">
          <h1>Choose Your Plan</h1>
          <p>Select the perfect plan for your social media management needs</p>

          {/* Billing Period Toggle */}
          <div className="billing-toggle">
            <button
              className={`toggle-btn ${billingPeriod === 'monthly' ? 'active' : ''}`}
              onClick={() => setBillingPeriod('monthly')}
            >
              Monthly
            </button>
            <button
              className={`toggle-btn ${billingPeriod === 'annual' ? 'active' : ''}`}
              onClick={() => setBillingPeriod('annual')}
            >
              Annual
              <span className="savings-badge">Save 17%</span>
            </button>
          </div>
        </div>

      {/* Payment Status Messages */}
      {isPaymentSuccess && (
        <div className="payment-message success">
          <FaCheck /> Payment successful! Your subscription is now active.
        </div>
      )}

      {isPaymentCancelled && (
        <div className="payment-message cancelled">
          Payment was cancelled. You can try again when you're ready.
        </div>
      )}

      {error && (
        <div className="payment-message error">
          {error}
        </div>
      )}

      {/* Current Subscription Status */}
      {user && subscriptionStatus === 'active' && (
        <div className="current-subscription">
          <span className="subscription-badge">
            Current Plan: <strong>{subscriptionTier?.replace('-', ' ').toUpperCase() || 'Active'}</strong>
          </span>
          <button
            className="btn-manage"
            onClick={handleManageSubscription}
            disabled={loading === 'manage'}
          >
            {loading === 'manage' ? (
              <>
                <FaSpinner className="spinner" /> Loading...
              </>
            ) : (
              'Manage Subscription'
            )}
          </button>
        </div>
      )}

      {/* Pricing Grid */}
      <div className="pricing-grid">
        {PRICING_TIERS.map((tier) => {
          const isCurrentPlan = subscriptionTier === tier.id && subscriptionStatus === 'active';
          const isLoading = loading === tier.id;

          return (
            <div
              key={tier.id}
              className={`pricing-card ${tier.popular ? 'popular' : ''} ${isCurrentPlan ? 'current' : ''}`}
            >
              {tier.popular && <div className="popular-badge">Most Popular</div>}
              {isCurrentPlan && <div className="current-badge">Current Plan</div>}

              <div className="card-header">
                <h2>{tier.name}</h2>
                <p className="tier-description">{tier.description}</p>
              </div>

              <div className="price-section">
                <span className="price">
                  {formatPrice(
                    billingPeriod === 'monthly' ? tier.monthlyPrice : tier.annualPrice,
                    tier.currency
                  )}
                </span>
                <span className="period">
                  per {billingPeriod === 'monthly' ? 'month' : 'year'}
                </span>
                {billingPeriod === 'annual' && (
                  <span className="annual-info">
                    {formatPrice(tier.annualPrice / 12, tier.currency)}/month billed annually
                  </span>
                )}
              </div>

              <ul className="features-list">
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

              <button
                className={`btn-select ${isCurrentPlan ? 'btn-current' : ''} ${tier.popular ? 'btn-popular' : ''}`}
                onClick={() => handleSelectPlan(tier.id)}
                disabled={isLoading || isCurrentPlan}
              >
                {isLoading ? (
                  <>
                    <FaSpinner className="spinner" /> Processing...
                  </>
                ) : isCurrentPlan ? (
                  'Current Plan'
                ) : subscriptionStatus === 'active' ? (
                  'Switch Plan'
                ) : (
                  'Get Started'
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* FAQ or Additional Info */}
      <div className="pricing-footer">
        <p>All plans include 14-day free trial. Cancel anytime.</p>
        <p className="contact-info">
          Need a custom plan? <a href="mailto:support@woozysocial.com">Contact us</a>
        </p>
      </div>
      </div>
    </>
  );
};

export default Pricing;
