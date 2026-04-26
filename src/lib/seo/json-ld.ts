const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://corgly.app';

export function buildPersonSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Pedro Corgnati',
    jobTitle: 'Professor de Português Brasileiro',
    url: SITE_URL,
    sameAs: [] as string[],
    knowsAbout: [
      'Brazilian Portuguese',
      'Portuguese Language Teaching',
      'Language Learning',
    ],
    nationality: { '@type': 'Country', name: 'Brazil' },
  };
}

export function buildWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Corgly',
    url: SITE_URL,
    description: 'Live 1:1 Brazilian Portuguese lessons with native teacher',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/content?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildCourseSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: 'Corgly Method — Brazilian Portuguese',
    description:
      'Personalized 1:1 Brazilian Portuguese lessons using the Corgly Method',
    provider: buildPersonSchema(),
    inLanguage: ['pt-BR', 'en', 'es', 'it'],
    educationalLevel: 'Beginner to Advanced',
    courseMode: 'online',
    offers: {
      '@type': 'Offer',
      price: '25',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  };
}

/**
 * Parses duration string like "12 min" to ISO 8601 format like "PT12M"
 */
function durationToISO8601(durationStr: string): string {
  const match = durationStr.match(/(\d+)\s*min/i);
  if (match) {
    const minutes = parseInt(match[1], 10);
    return `PT${minutes}M`;
  }
  return 'PT0M';
}

export function buildVideoObjectSchema(content: {
  title: string;
  description: string;
  videoId: string;
  duration: string;
  category?: string;
  contentId?: string;
}) {
  const contentId = content.contentId || content.title.toLowerCase().replace(/\s+/g, '-');
  const videoUrl = `${SITE_URL}/content/${contentId}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: content.title,
    description: content.description,
    uploadDate: new Date().toISOString().split('T')[0],
    duration: durationToISO8601(content.duration),
    thumbnailUrl: `https://i.ytimg.com/vi/${content.videoId}/hqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${content.videoId}`,
    author: buildPersonSchema(),
    interactionCount: '0',
    isFamilyFriendly: true,
  };
}

/**
 * Organization schema — represents Corgly as the publishing organization.
 * Useful for knowledge-graph / brand recognition on SERPs.
 */
export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Corgly',
    url: SITE_URL,
    logo: `${SITE_URL}/images/logo-corgly.png`,
    description:
      'Online school for 1:1 Brazilian Portuguese lessons with native teachers.',
    founder: buildPersonSchema(),
    sameAs: [] as string[],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      availableLanguage: ['Portuguese', 'English', 'Spanish', 'Italian'],
    },
  };
}

/**
 * FAQPage schema — accepts a list of {question, answer} pairs.
 * Pass the FAQ items rendered on the page to keep schema in sync with content.
 */
export function buildFaqSchema(items: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

// ─── Task-spec aliases (TASK-11 ST001) ─────────────────────────────────────
// The task spec names the helpers organizationJsonLd / courseJsonLd / faqJsonLd.
// These aliases mirror the existing build* API without breaking current callers.
export const organizationJsonLd = buildOrganizationSchema;
export const courseJsonLd = buildCourseSchema;
export const faqJsonLd = buildFaqSchema;

/** Returns all three schemas for the landing page. */
export function buildLandingPageSchemas() {
  return [buildPersonSchema(), buildWebSiteSchema(), buildCourseSchema()];
}
