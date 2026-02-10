import { Helmet } from 'react-helmet-async';

/**
 * SEO Component - Manages meta tags, Open Graph, Twitter Cards, and Schema.org markup
 *
 * @param {Object} props
 * @param {string} props.title - Page title (will be appended with " | Woozy Social")
 * @param {string} props.description - Page meta description
 * @param {string} props.canonical - Canonical URL for the page
 * @param {string} props.ogImage - Open Graph image URL
 * @param {string} props.ogType - Open Graph type (default: 'website')
 * @param {Object} props.schema - Schema.org structured data object
 * @param {boolean} props.noindex - Set to true to prevent indexing
 * @param {string} props.keywords - Meta keywords (optional)
 */
export default function SEO({
  title = 'Woozy Social',
  description = 'Create, schedule, and manage your social media content at scale with Woozy Social. AI-powered platform for brands, agencies, and creators.',
  canonical = '',
  ogImage = '/assets/woozysocial-og.png',
  ogType = 'website',
  schema = null,
  noindex = false,
  keywords = '',
}) {
  // Get the base URL from environment or window location
  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://www.woozysocials.com';

  // Construct full canonical URL
  const fullCanonical = canonical
    ? `${baseUrl}${canonical.startsWith('/') ? canonical : `/${canonical}`}`
    : typeof window !== 'undefined'
    ? window.location.href.split('?')[0].split('#')[0]
    : baseUrl;

  // Construct full OG image URL
  const fullOgImage = ogImage.startsWith('http')
    ? ogImage
    : `${baseUrl}${ogImage.startsWith('/') ? ogImage : `/${ogImage}`}`;

  // Construct page title
  const pageTitle = title.includes('Woozy Social')
    ? title
    : `${title} | Woozy Social`;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{pageTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}

      {/* Canonical URL */}
      <link rel="canonical" href={fullCanonical} />

      {/* Robots */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      )}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={fullCanonical} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullOgImage} />
      <meta property="og:site_name" content="Woozy Social" />
      <meta property="og:locale" content="en_US" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullCanonical} />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullOgImage} />
      <meta name="twitter:creator" content="@woozysocial" />
      <meta name="twitter:site" content="@woozysocial" />

      {/* Additional Meta Tags */}
      <meta name="author" content="Woozy Social" />
      <meta name="theme-color" content="#9333EA" />

      {/* Schema.org Structured Data */}
      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      )}
    </Helmet>
  );
}

/**
 * Pre-configured SEO components for common page types
 */
export const LoginSEO = () => (
  <SEO
    title="Sign In"
    description="Sign in to your Woozy Social account. Manage your social media content, schedule posts, and engage with your audience across multiple platforms."
    canonical="/login"
    ogType="website"
  />
);

export const SignUpSEO = () => (
  <SEO
    title="Create Your Account"
    description="Start your free trial with Woozy Social. Create, schedule, and manage social media content at scale with AI-powered tools. No credit card required."
    canonical="/signup"
    ogType="website"
    keywords="social media management, sign up, free trial, social media scheduling"
  />
);

export const PricingSEO = () => {
  const pricingSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Woozy Social",
    "description": "AI-powered social media management platform for brands, agencies, and creators",
    "brand": {
      "@type": "Brand",
      "name": "Woozy Social"
    },
    "offers": [
      {
        "@type": "Offer",
        "name": "Solo Plan",
        "price": "19",
        "priceCurrency": "USD",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": "19",
          "priceCurrency": "USD",
          "unitText": "MONTH"
        },
        "description": "Perfect for individual creators and solopreneurs"
      },
      {
        "@type": "Offer",
        "name": "Pro Plan",
        "price": "49",
        "priceCurrency": "USD",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": "49",
          "priceCurrency": "USD",
          "unitText": "MONTH"
        },
        "description": "For growing businesses and small teams"
      },
      {
        "@type": "Offer",
        "name": "Pro Plus Plan",
        "price": "99",
        "priceCurrency": "USD",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": "99",
          "priceCurrency": "USD",
          "unitText": "MONTH"
        },
        "description": "For established businesses with multiple brands"
      },
      {
        "@type": "Offer",
        "name": "Agency Plan",
        "price": "199",
        "priceCurrency": "USD",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": "199",
          "priceCurrency": "USD",
          "unitText": "MONTH"
        },
        "description": "For agencies managing multiple clients"
      }
    ]
  };

  return (
    <SEO
      title="Pricing Plans - Start Free Today"
      description="Flexible pricing for every team size. Start with our free plan or choose from Solo ($19/mo), Pro ($49/mo), Pro Plus ($99/mo), or Agency ($199/mo) plans. 14-day free trial available."
      canonical="/pricing"
      ogType="website"
      schema={pricingSchema}
      keywords="social media management pricing, social media scheduler cost, social media tools pricing"
    />
  );
};

export const DashboardSEO = () => (
  <SEO
    title="Dashboard"
    description="Your social media command center. View analytics, schedule posts, and manage your content across all platforms."
    canonical="/dashboard"
    noindex={true} // Protected page - no need to index
  />
);

export const ClientDashboardSEO = () => (
  <SEO
    title="Client Dashboard"
    description="Review and approve content from your social media team."
    canonical="/client/dashboard"
    noindex={true} // Protected page - no need to index
  />
);
