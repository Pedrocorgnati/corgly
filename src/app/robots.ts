import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://corgly.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/content', '/privacy', '/terms'],
        disallow: ['/dashboard', '/admin', '/api/', '/session', '/auth/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
