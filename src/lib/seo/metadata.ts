import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants/landing';

/** Supported locales for hreflang alternates. */
export const SEO_LOCALES = ['pt-BR', 'en-US', 'es-ES', 'it-IT'] as const;
export type SeoLocale = (typeof SEO_LOCALES)[number];

/**
 * Builds canonical + hreflang language alternates for a given path.
 *
 * Since this project serves all languages from the same URL (locale is
 * negotiated via cookie/Accept-Language in i18n/request.ts), every language
 * alternate points to the same absolute URL. `x-default` is also included.
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
  languages['x-default'] = `${SITE_URL}/`;

  return { canonical, languages };
}

const META_BY_LOCALE: Record<
  string,
  { title: string; description: string; ogTitle: string; ogDescription: string }
> = {
  'en-US': {
    title: 'Corgly — Brazilian Portuguese Tutor Online | Private Live Lessons',
    description:
      'Learn Brazilian Portuguese with a native tutor. Private live lessons. First lesson 50% off at US$ 12.50.',
    ogTitle: 'Corgly — Brazilian Portuguese Tutor Online | Private Live Lessons',
    ogDescription:
      'Learn Brazilian Portuguese with a native tutor. Private live lessons. First lesson 50% off at US$ 12.50.',
  },
  'pt-BR': {
    title: 'Corgly — Aulas particulares de português brasileiro ao vivo',
    description:
      'Aprenda português brasileiro com um professor nativo. Aulas particulares ao vivo. Primeira aula com 50% OFF por US$ 12,50.',
    ogTitle: 'Corgly — Aulas particulares de português brasileiro ao vivo',
    ogDescription:
      'Aprenda português brasileiro com um professor nativo. Aulas particulares ao vivo. Primeira aula com 50% OFF por US$ 12,50.',
  },
  'es-ES': {
    title: 'Corgly — Clases particulares de portugués brasileño en vivo',
    description:
      'Aprende portugués brasileño con un profesor nativo. Clases particulares en vivo. Primera clase con 50% de descuento a US$ 12,50.',
    ogTitle: 'Corgly — Clases particulares de portugués brasileño en vivo',
    ogDescription:
      'Aprende portugués brasileño con un profesor nativo. Clases particulares en vivo. Primera clase con 50% de descuento a US$ 12,50.',
  },
  'it-IT': {
    title: 'Corgly — Lezioni private di portoghese brasiliano dal vivo',
    description:
      'Impara il portoghese brasiliano con un insegnante madrelingua. Lezioni private dal vivo. Prima lezione scontata del 50% a US$ 12.50.',
    ogTitle: 'Corgly — Lezioni private di portoghese brasiliano dal vivo',
    ogDescription:
      'Impara il portoghese brasiliano con un insegnante madrelingua. Lezioni private dal vivo. Prima lezione scontata del 50% a US$ 12.50.',
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
 * noindex is applied to error/not-found pages and hidden /content.
 */
export function generatePageMetadata(
  page: 'privacy' | 'terms' | 'content' | 'not-found' | 'error',
  locale = 'en-US',
): Metadata {
  const noIndexPages: string[] = ['not-found', 'error', 'content'];
  return {
    ...generateLandingMetadata(locale),
    robots: noIndexPages.includes(page)
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}
