import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants/landing';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy', '/terms'],
        disallow: ['/dashboard', '/admin', '/api/', '/session', '/auth/', '/content'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
