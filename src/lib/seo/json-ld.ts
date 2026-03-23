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

/** Returns all three schemas for the landing page. */
export function buildLandingPageSchemas() {
  return [buildPersonSchema(), buildWebSiteSchema(), buildCourseSchema()];
}
