# Woozy Social - SEO Quick Reference

## 🚀 Quick Start

### Test Your SEO Right Now

```bash
# 1. Start dev server
npm run dev

# 2. Visit these URLs and check DevTools <head> section:
http://localhost:5173/login
http://localhost:5173/signup
http://localhost:5173/pricing

# 3. Look for:
✓ Dynamic <title> tag
✓ Meta description
✓ Open Graph tags
✓ Schema.org JSON-LD
```

---

## 📂 Key Files Created/Modified

| File | Purpose | Status |
|------|---------|--------|
| [`src/components/SEO.jsx`](src/components/SEO.jsx) | Reusable SEO component | ✅ Created |
| [`src/utils/seoConfig.js`](src/utils/seoConfig.js) | SEO configuration & schemas | ✅ Created |
| [`public/robots.txt`](public/robots.txt) | Search engine directives | ✅ Created |
| [`api/sitemap.xml.js`](api/sitemap.xml.js) | Dynamic XML sitemap | ✅ Created |
| [`index.html`](index.html) | Enhanced base meta tags | ✅ Updated |
| [`src/main.jsx`](src/main.jsx) | Added HelmetProvider | ✅ Updated |
| [`src/App.jsx`](src/App.jsx) | Global schema markup | ✅ Updated |
| [`vercel.json`](vercel.json) | SEO headers & redirects | ✅ Updated |
| [`src/components/auth/LoginPage.jsx`](src/components/auth/LoginPage.jsx) | Login page SEO | ✅ Updated |
| [`src/components/auth/SignUpPage.jsx`](src/components/auth/SignUpPage.jsx) | Signup page SEO | ✅ Updated |
| [`src/pages/Pricing.jsx`](src/pages/Pricing.jsx) | Pricing page SEO | ✅ Updated |

---

## 🎯 How to Add SEO to Any Page (Copy & Paste)

### Method 1: Simple Page SEO

```jsx
import SEO from '../components/SEO';

export const YourPage = () => {
  return (
    <>
      <SEO
        title="Your Page Title"
        description="A compelling description of your page that will appear in search results"
        canonical="/your-page-url"
      />
      <div>
        {/* Your page content here */}
      </div>
    </>
  );
};
```

### Method 2: Using Pre-configured Components

```jsx
import { LoginSEO, SignUpSEO, PricingSEO } from '../components/SEO';

// For login page
<LoginSEO />

// For signup page
<SignUpSEO />

// For pricing page
<PricingSEO />
```

### Method 3: Protected Page (No Indexing)

```jsx
import SEO from '../components/SEO';

export const ProtectedPage = () => {
  return (
    <>
      <SEO
        title="Dashboard"
        description="Private dashboard content"
        noindex={true}  // ← Prevents search engine indexing
      />
      <div>
        {/* Your protected content */}
      </div>
    </>
  );
};
```

---

## 📋 Pre-Deployment Checklist

Before deploying to production:

- [ ] Test all public pages have unique titles
- [ ] Test all public pages have meta descriptions
- [ ] Verify `/robots.txt` works locally
- [ ] Check schema markup with [validator](https://validator.schema.org/)
- [ ] Ensure no duplicate content

---

## 🔗 Important URLs After Deployment

| Resource | URL | Purpose |
|----------|-----|---------|
| Robots.txt | `https://www.woozysocials.com/robots.txt` | Search engine rules |
| Sitemap | `https://www.woozysocials.com/sitemap.xml` | List of pages |
| Google Search Console | [console](https://search.google.com/search-console) | Monitor SEO |
| Facebook Debugger | [debugger](https://developers.facebook.com/tools/debug/) | Test OG tags |
| Twitter Card Validator | [validator](https://cards-dev.twitter.com/validator) | Test Twitter cards |
| Rich Results Test | [test](https://search.google.com/test/rich-results) | Test schema |

---

## 🎨 Current SEO Settings

### Page Titles (Format)
```
{Page Title} | Woozy Social
```

Examples:
- "Sign In | Woozy Social"
- "Pricing Plans - Start Free Today | Woozy Social"
- "Create Your Account | Woozy Social"

### Default Description
```
Create, schedule, publish, and easily manage your social media content
at scale with Woozy Social's AI-powered platform. Perfect for brands,
agencies, and creators.
```

### Primary Keywords
- Social media management
- Social media scheduler
- AI content creation
- Social media marketing

### Social Media
- Twitter: @woozysocial
- Facebook: woozysocial
- Instagram: @woozysocial
- LinkedIn: company/woozysocial

---

## 🛠️ Common Tasks

### Update Site-Wide Description
Edit [`src/utils/seoConfig.js`](src/utils/seoConfig.js):
```js
export const seoConfig = {
  defaultDescription: 'Your new description here',
  // ...
};
```

### Add New Page to Sitemap
Edit [`api/sitemap.xml.js`](api/sitemap.xml.js):
```js
const pages = [
  // ... existing pages
  {
    url: '/your-new-page',
    changefreq: 'weekly',
    priority: '0.8',
    lastmod: currentDate,
  },
];
```

### Block Page from Search Engines
Edit [`public/robots.txt`](public/robots.txt):
```
Disallow: /your-page
```

### Change Company Info
Edit [`src/utils/seoConfig.js`](src/utils/seoConfig.js):
```js
export const seoConfig = {
  company: {
    name: 'Woozy Social',
    email: 'hello@woozysocials.com',
    // ... update these fields
  },
};
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Meta tags not showing | Clear browser cache, check HelmetProvider |
| Sitemap 404 | Verify `/api/sitemap.xml.js` exists, redeploy |
| Wrong title in Google | Wait 1-2 weeks, or request re-index in Search Console |
| OG image not showing | Check file exists at `/public/assets/woozysocial-og.png` |
| Schema errors | Validate at schema.org, check JSON formatting |

---

## 📞 Need Help?

1. Read full guide: [`SEO_IMPLEMENTATION_GUIDE.md`](SEO_IMPLEMENTATION_GUIDE.md)
2. Check code examples in [`src/components/SEO.jsx`](src/components/SEO.jsx)
3. Test with online tools (links above)
4. Review Google Search Console errors

---

## 🎯 Expected Search Result (After Indexing)

```
Woozy Social - AI-Powered Social Media Management
https://www.woozysocials.com

Create, schedule, publish, and easily manage your social media
content at scale with Woozy Social's AI-powered platform.
Perfect for brands, agencies, and creators.

› Pricing            › Sign Up            › Features
```

---

**Quick Deploy Command:**
```bash
git add .
git commit -m "Implement professional SEO infrastructure"
git push
```

After pushing, verify:
1. Visit https://www.woozysocials.com/robots.txt
2. Visit https://www.woozysocials.com/sitemap.xml
3. View page source on /login, /signup, /pricing
4. Check meta tags in <head>

🎉 You're all set!
