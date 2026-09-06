import { FIRST_LESSON_USD, SITE_URL } from '@/lib/constants/landing';

const INSTAGRAM = 'https://www.instagram.com/corgly.app/';

export function buildPersonSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Pedro',
    jobTitle: 'Native Brazilian Portuguese teacher',
    url: SITE_URL,
    sameAs: [INSTAGRAM],
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
    description: 'Private live Brazilian Portuguese lessons with a native teacher',
  };
}

export function buildCourseSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: 'Private live Brazilian Portuguese lessons',
    description:
      'Private live Brazilian Portuguese lessons with Pedro. First lesson 50% off.',
    provider: buildPersonSchema(),
    inLanguage: ['pt-BR', 'en', 'es', 'it'],
    educationalLevel: 'Beginner to Advanced',
    courseMode: 'online',
    offers: {
      '@type': 'Offer',
      price: String(FIRST_LESSON_USD),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: SITE_URL,
    },
  };
}

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
    url: `${SITE_URL}/content/${contentId}`,
  };
}

export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Corgly',
    url: SITE_URL,
    logo: `${SITE_URL}/images/brand/corgi.png`,
    description:
      'Private live Brazilian Portuguese lessons with a native teacher.',
    founder: buildPersonSchema(),
    sameAs: [INSTAGRAM],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@corgly.app',
      availableLanguage: ['Portuguese', 'English', 'Spanish', 'Italian'],
    },
  };
}

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

export const organizationJsonLd = buildOrganizationSchema;
export const courseJsonLd = buildCourseSchema;
export const faqJsonLd = buildFaqSchema;

export const LANDING_FAQ_SCHEMA: Array<{ question: string; answer: string }> = [
  { question: 'How long is each live lesson?', answer: 'Every live lesson lasts 50 minutes, every time, so focus, pace and learning stay productive.' },
  { question: 'Can I cancel or reschedule?', answer: 'Yes, up to 24h before. Later than that, the credit is used.' },
  { question: 'How long are pack credits valid?', answer: '6 months from purchase. Monthly credits follow the billing cycle.' },
  { question: 'What is the difference between Pack 10 and Monthly?', answer: 'Pack 10 is 10 credits you use when you want (6-month expiry). Monthly is 10 lessons at US$ 17 or 20 lessons at US$ 15, billed each cycle. Cancel at cycle end.' },
  { question: 'Do I need to know Portuguese already?', answer: 'No. We start from zero. Lessons can run in English, Spanish or Italian until Portuguese takes over.' },
  { question: 'I have a trip, a move or an interview soon. Can we go faster?', answer: 'Yes. Intensive plan: conversation, priority vocabulary, frequent mistakes, weekly goals.' },
  { question: 'Do you teach Portuguese for work?', answer: 'Yes. Meetings, emails, presentations, interviews, negotiation and field vocabulary. Background in business admin and software.' },
  { question: 'Brazilian or European Portuguese?', answer: 'Brazilian only. The Portuguese Brazilians actually speak.' },
  { question: 'How does the first-lesson price work?', answer: 'US$ 12.50 once per new student (50% off US$ 25). In that lesson we map your level, goals and blockers and set a simple plan.' },
  { question: 'How do time zones work?', answer: 'You book in your local time. The calendar converts.' },
  { question: 'Where does the lesson happen?', answer: 'Live on Zoom. You get the link by email.' },
  { question: 'How do I pay?', answer: 'USD, card via Stripe.' },
];

export function buildLandingPageSchemas() {
  return [
    buildPersonSchema(),
    buildWebSiteSchema(),
    buildCourseSchema(),
    buildOrganizationSchema(),
    buildFaqSchema(LANDING_FAQ_SCHEMA),
  ];
}
