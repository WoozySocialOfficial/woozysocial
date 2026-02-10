/**
 * SEO Configuration for Woozy Social
 * Centralized configuration for meta tags, schema markup, and SEO settings
 */

export const seoConfig = {
  // Base site information
  siteName: 'Woozy Social',
  siteUrl: 'https://www.woozysocials.com',
  defaultTitle: 'Woozy Social',
  defaultDescription: 'Create, schedule, publish, and easily manage your social media content at scale with Woozy Social\'s AI-powered platform. Perfect for brands, agencies, and creators.',

  // Social media handles
  social: {
    twitter: '@woozysocial',
    facebook: 'woozysocial',
    instagram: '@woozysocial',
    linkedin: 'company/woozysocial',
  },

  // Default Open Graph image
  defaultOgImage: '/assets/woozysocial-og.png',

  // Brand colors
  themeColor: '#9333EA', // Purple brand color

  // Company information for Schema.org
  company: {
    name: 'Woozy Social',
    legalName: 'Woozy Social Inc.',
    url: 'https://www.woozysocials.com',
    logo: 'https://www.woozysocials.com/assets/woozysocial.png',
    description: 'AI-powered social media management platform for brands, agencies, and creators',
    foundingDate: '2024',
    email: 'hello@woozysocials.com',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'US',
    },
    sameAs: [
      'https://twitter.com/woozysocial',
      'https://facebook.com/woozysocial',
      'https://instagram.com/woozysocial',
      'https://linkedin.com/company/woozysocial',
    ],
  },
};

/**
 * Generate Organization Schema markup
 */
export const getOrganizationSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: seoConfig.company.name,
  legalName: seoConfig.company.legalName,
  url: seoConfig.company.url,
  logo: {
    '@type': 'ImageObject',
    url: seoConfig.company.logo,
  },
  description: seoConfig.company.description,
  foundingDate: seoConfig.company.foundingDate,
  email: seoConfig.company.email,
  address: seoConfig.company.address,
  sameAs: seoConfig.company.sameAs,
});

/**
 * Generate SoftwareApplication Schema markup
 */
export const getSoftwareApplicationSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Woozy Social',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Social Media Management',
  operatingSystem: 'Web Browser',
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '0',
    highPrice: '199',
    priceCurrency: 'USD',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: '19',
      priceCurrency: 'USD',
      unitText: 'MONTH',
    },
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '150',
    bestRating: '5',
    worstRating: '1',
  },
  description: 'AI-powered social media management platform that helps you create, schedule, and publish content across multiple social media platforms.',
  featureList: [
    'AI Content Generation',
    'Multi-platform Scheduling',
    'Team Collaboration',
    'Client Approval Workflow',
    'Social Media Analytics',
    'Content Calendar',
    'Social Inbox Management',
  ],
});

/**
 * Generate WebSite Schema markup with site search
 */
export const getWebSiteSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: seoConfig.siteName,
  url: seoConfig.siteUrl,
  description: seoConfig.defaultDescription,
  publisher: {
    '@type': 'Organization',
    name: seoConfig.company.name,
    logo: {
      '@type': 'ImageObject',
      url: seoConfig.company.logo,
    },
  },
});

/**
 * Generate BreadcrumbList Schema markup
 */
export const getBreadcrumbSchema = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: `${seoConfig.siteUrl}${item.path}`,
  })),
});

/**
 * Generate FAQ Schema markup
 */
export const getFAQSchema = (faqs) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
});

/**
 * Page-specific metadata configurations
 */
export const pageMetadata = {
  home: {
    title: 'Woozy Social',
    description: 'Create, schedule, publish, and easily manage your social media content at scale with Woozy Social\'s AI-powered platform. Perfect for brands, agencies, and creators.',
    keywords: 'social media management, social media scheduler, AI content creation, social media marketing, content calendar, social media analytics',
  },
  pricing: {
    title: 'Pricing Plans - Start Free Today',
    description: 'Flexible pricing for every team size. Start with our free plan or choose from Solo ($19/mo), Pro ($49/mo), Pro Plus ($99/mo), or Agency ($199/mo) plans. 14-day free trial available.',
    keywords: 'social media management pricing, social media scheduler cost, social media tools pricing',
  },
  login: {
    title: 'Sign In',
    description: 'Sign in to your Woozy Social account. Manage your social media content, schedule posts, and engage with your audience across multiple platforms.',
    keywords: 'login, sign in, social media management login',
  },
  signup: {
    title: 'Create Your Account',
    description: 'Start your free trial with Woozy Social. Create, schedule, and manage social media content at scale with AI-powered tools. No credit card required.',
    keywords: 'sign up, create account, free trial, social media management',
  },
  dashboard: {
    title: 'Dashboard',
    description: 'Your social media command center. View analytics, schedule posts, and manage your content across all platforms.',
    noindex: true,
  },
  compose: {
    title: 'Create Post',
    description: 'Create and schedule social media posts with AI-powered content generation.',
    noindex: true,
  },
  schedule: {
    title: 'Content Calendar',
    description: 'View and manage your scheduled social media posts across all platforms.',
    noindex: true,
  },
  posts: {
    title: 'Posts',
    description: 'View all your published and scheduled social media posts.',
    noindex: true,
  },
  team: {
    title: 'Team Management',
    description: 'Manage your team members, roles, and permissions.',
    noindex: true,
  },
  clientDashboard: {
    title: 'Client Dashboard',
    description: 'Review and approve content from your social media team.',
    noindex: true,
  },
  clientApprovals: {
    title: 'Pending Approvals',
    description: 'Review posts that require your approval before publishing.',
    noindex: true,
  },
};

/**
 * Utility function to get page metadata
 */
export const getPageMetadata = (pageName) => {
  return pageMetadata[pageName] || {
    title: seoConfig.defaultTitle,
    description: seoConfig.defaultDescription,
  };
};
