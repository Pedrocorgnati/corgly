import type { Metadata } from 'next';

// Single source of truth for site URL — validated at build time via env
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://corgly.app';

/** Supported locales for hreflang alternates. */
export const SEO_LOCALES = ['pt-BR', 'en-US', 'es-ES', 'it-IT'] as const;
export type SeoLocale = (typeof SEO_LOCALES)[number];

/**
 * Builds canonical + hreflang language alternates for a given path.
 *
 * Since this project serves all languages from the same URL (locale is
 * negotiated via cookie/Accept-Language in i18n/request.ts), every language
 * alternate points to the same absolute URL. `x-default` is also included.
 *
 * @param path - Path starting with "/" (e.g. "/", "/privacy", "/blog/pt-BR/foo")
 * @param perLocalePath - Optional map to override path per locale (used for
 *                       routes that DO have locale-prefixed URLs, e.g. blog).
 */
export function buildAlternates(
  path: string,
  perLocalePath?: Partial<Record<SeoLocale, string>>,
): NonNullable<Metadata['alternates']> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const canonical = `${SITE_URL}${normalized}`;

  const languages: Record<string, string> = {};
  for (const loc of SEO_LOCALES) {
    const p = perLocalePath?.[loc] ?? normalized;
    languages[loc] = `${SITE_URL}${p.startsWith('/') ? p : `/${p}`}`;
  }
  languages['x-default'] = canonical;

  return { canonical, languages };
}

const META_BY_LOCALE: Record<
  string,
  { title: string; description: string; ogTitle: string; ogDescription: string }
> = {
  'pt-BR': {
    title: 'Corgly — Aprenda Português Brasileiro com Professor Nativo',
    description:
      'Aulas 1:1 de português brasileiro ao vivo. Metodologia Corgly Method. Primeira aula 50% OFF.',
    ogTitle: 'Corgly — Aprenda Português com Pedro',
    ogDescription:
      'Aulas personalizadas de português brasileiro para alunos internacionais.',
  },
  'en-US': {
    title: 'Corgly — Learn Brazilian Portuguese with a Native Teacher',
    description:
      'Live 1:1 Brazilian Portuguese lessons. Corgly Method. First lesson 50% OFF.',
    ogTitle: 'Corgly — Learn Portuguese with Pedro',
    ogDescription:
      'Personalized Brazilian Portuguese lessons for international students.',
  },
  'es-ES': {
    title: 'Corgly — Aprende Portugués Brasileño con Profesor Nativo',
    description:
      'Clases 1:1 de portugués brasileño en vivo. Método Corgly. Primera clase 50% DESCUENTO.',
    ogTitle: 'Corgly — Aprende Portugués con Pedro',
    ogDescription:
      'Clases personalizadas de portugués brasileño para estudiantes internacionales.',
  },
  'it-IT': {
    title: "Corgly — Impara il Portoghese Brasiliano con un Insegnante Madrelingua",
    description:
      "Lezioni 1:1 di portoghese brasiliano dal vivo. Metodo Corgly. Prima lezione 50% SCONTO.",
    ogTitle: "Corgly — Impara il Portoghese con Pedro",
    ogDescription:
      "Lezioni personalizzate di portoghese brasiliano per studenti internazionali.",
  },
};

/**
 * Generates full Metadata for the landing page with hreflang alternates
 * (injected automatically by Next.js via metadata.alternates.languages).
 */
export function generateLandingMetadata(locale = 'en-US'): Metadata {
  const meta = META_BY_LOCALE[locale] ?? META_BY_LOCALE['en-US'];

  const alternateLocales = SEO_LOCALES.filter((l) => l !== locale).map((l) =>
    l.replace('-', '_'),
  );

  return {
    title: meta.title,
    description: meta.description,
    metadataBase: new URL(SITE_URL),
    alternates: buildAlternates('/'),
    openGraph: {
      title: meta.ogTitle,
      description: meta.ogDescription,
      url: SITE_URL,
      siteName: 'Corgly',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: meta.ogTitle,
        },
      ],
      locale: locale.replace('-', '_'),
      alternateLocale: alternateLocales,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.ogTitle,
      description: meta.ogDescription,
      images: ['/opengraph-image'],
    },
    robots: { index: true, follow: true },
  };
}

/**
 * Generates Metadata for individual public pages.
 * noindex is applied to error/not-found pages.
 */
export function generatePageMetadata(
  page: 'privacy' | 'terms' | 'content' | 'not-found' | 'error',
  locale = 'en-US',
): Metadata {
  const noIndexPages: string[] = ['not-found', 'error'];
  return {
    ...generateLandingMetadata(locale),
    robots: noIndexPages.includes(page)
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}
