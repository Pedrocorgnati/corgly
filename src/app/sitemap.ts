import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants/landing';

/** Locales supported for hreflang alternates. Keep in sync with i18n/config.ts. */
const SITEMAP_LOCALES = ['pt-BR', 'en-US', 'es-ES', 'it-IT'] as const;

// Static public routes — excludes /dashboard, /admin, /session, /api, /auth, /content
// Locale is negotiated via cookie/Accept-Language (i18n/request.ts), so the
// URL is the same across locales; each entry still declares hreflang alternates
// to signal Google the page is available in all 4 languages.
const STATIC_ROUTES = [
  { route: '', priority: 1.0, changeFrequency: 'weekly' as const },
  { route: '/privacy', priority: 0.7, changeFrequency: 'yearly' as const },
  { route: '/terms', priority: 0.7, changeFrequency: 'yearly' as const },
  { route: '/support', priority: 0.6, changeFrequency: 'monthly' as const },
] as const;

/** Builds hreflang language alternates for a given path. */
function buildLanguages(path: string): Record<string, string> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const entries: Record<string, string> = {};
  for (const loc of SITEMAP_LOCALES) {
    entries[loc] = `${SITE_URL}${normalized}`;
  }
  return entries;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-04-21');

  // Static routes — each entry lists all locale alternates
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((item) => ({
    url: `${SITE_URL}${item.route || '/'}`,
    lastModified,
    changeFrequency: item.changeFrequency,
    priority: item.priority,
    alternates: { languages: buildLanguages(item.route || '/') },
  }));

  const contentEntries: MetadataRoute.Sitemap = [];

  // Blog index is locale-prefixed (/blog/[locale]) — emit one URL per locale
  // with alternates pointing at the sibling locale-prefixed URLs.
  const blogEntries: MetadataRoute.Sitemap = SITEMAP_LOCALES.map((loc) => {
    const languages: Record<string, string> = {};
    for (const alt of SITEMAP_LOCALES) {
      languages[alt] = `${SITE_URL}/blog/${alt}`;
    }
    return {
      url: `${SITE_URL}/blog/${loc}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      alternates: { languages },
    };
  });

  return [...staticEntries, ...contentEntries, ...blogEntries];
}
