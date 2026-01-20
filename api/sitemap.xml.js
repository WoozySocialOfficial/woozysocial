/**
 * Dynamic Sitemap Generator for Woozy Social
 * Generates XML sitemap with public pages
 *
 * Access at: https://www.woozysocial.com/sitemap.xml
 */

export default async function handler(req, res) {
  try {
    const baseUrl = 'https://www.woozysocial.com';
    const currentDate = new Date().toISOString();

    // Define public pages with their priorities and change frequencies
    const pages = [
      {
        url: '/',
        changefreq: 'weekly',
        priority: '1.0',
        lastmod: currentDate,
      },
      {
        url: '/pricing',
        changefreq: 'monthly',
        priority: '0.9',
        lastmod: currentDate,
      },
      {
        url: '/login',
        changefreq: 'monthly',
        priority: '0.7',
        lastmod: currentDate,
      },
      {
        url: '/signup',
        changefreq: 'monthly',
        priority: '0.8',
        lastmod: currentDate,
      },
    ];

    // Generate XML sitemap
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${pages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

    // Set headers for XML response
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400'); // Cache for 24 hours

    return res.status(200).send(sitemap);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    return res.status(500).json({ error: 'Failed to generate sitemap' });
  }
}
