import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://corgly.app';

// Content map — same as in (public)/content/[id]/page.tsx
const CONTENT_ROUTES = [
  'greetings-intro',
  'verb-ser-estar',
  'daily-routine-vocab',
  'pronunciation-nasal',
  'ordering-food',
  'past-tense-basics',
] as const;

// Static public routes — excludes /dashboard, /admin, /session, /api, /auth
const STATIC_ROUTES = [
  { route: '', priority: 1.0, changeFrequency: 'weekly' as const },
  { route: '/content', priority: 0.8, changeFrequency: 'weekly' as const },
  { route: '/privacy', priority: 0.7, changeFrequency: 'yearly' as const },
  { route: '/terms', priority: 0.7, changeFrequency: 'yearly' as const },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  // Static routes
  const staticEntries = STATIC_ROUTES.map((item) => ({
    url: `${SITE_URL}${item.route}`,
    lastModified: new Date('2026-03-22'),
    changeFrequency: item.changeFrequency,
    priority: item.priority,
  }));

  // Dynamic content routes
  const contentEntries = CONTENT_ROUTES.map((contentId) => ({
    url: `${SITE_URL}/content/${contentId}`,
    lastModified: new Date('2026-03-22'),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  return [...staticEntries, ...contentEntries];
}
