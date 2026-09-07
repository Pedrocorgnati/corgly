import {
  FIRST_LESSON_USD,
  LESSON_DURATION_MINUTES,
  MONTHLY_OPTIONS,
  SINGLE_USD,
  SITE_URL,
  formatUsd,
} from '@/lib/constants/landing';

const INSTAGRAM = 'https://www.instagram.com/corgly.app/';

/**
 * O JSON-LD da landing e montado no modulo do server component
 * (`src/app/(public)/page.tsx`), fora de qualquer negociacao de locale: a mesma
 * URL e servida nos quatro idiomas e o rastreador nao carrega cookie nem JWT.
 * Por isso a copy do schema fica no locale default do produto
 * (`i18n/config.ts` -> defaultLocale = 'en-US'), igual ao `<title>`/`description`
 * do metadata raiz. Traduzir aqui sem traduzir a pagina produziria structured
 * data em desacordo com o HTML servido.
 */
const SCHEMA_COPY_LOCALE = 'en-US';

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

/**
 * WebSite sem `potentialAction`/SearchAction de proposito: o sitelinks
 * searchbox exige uma pagina de resultados indexavel que aceite o termo pela
 * URL. Hoje `/content` e `robots: { index: false }` e filtra por categoria no
 * cliente, sem `?q=` (`src/app/(public)/content/page.tsx`). Declarar a acao
 * seria apontar o Google para uma busca que nao existe.
 */
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
    name: 'Corgly Method: private live Brazilian Portuguese lessons',
    description:
      `Private live ${LESSON_DURATION_MINUTES}-minute Brazilian Portuguese lessons with Pedro. ` +
      `${formatUsd(SINGLE_USD, SCHEMA_COPY_LOCALE)} per lesson; ` +
      `the first lesson is ${formatUsd(FIRST_LESSON_USD, SCHEMA_COPY_LOCALE)}, once per new student.`,
    provider: buildPersonSchema(),
    inLanguage: ['pt-BR', 'en', 'es', 'it'],
    educationalLevel: 'Beginner to Advanced',
    courseMode: 'online',
    offers: {
      '@type': 'Offer',
      // Preco INCONDICIONAL da aula avulsa (`SINGLE_USD`). `FIRST_LESSON_USD`
      // (12.50) e promocional e so vale quando `isFirstPurchase` e verdadeiro
      // para aquele aluno; a SERP e mostrada a todo mundo, inclusive a quem ja
      // comprou, entao anunciar 12.50 como preco da oferta seria preco falso.
      // A promo aparece qualificada onde a condicao viaja junto: o item
      // `first_lesson` do FAQPage abaixo.
      price: String(SINGLE_USD),
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

const [MONTHLY_10, MONTHLY_20] = MONTHLY_OPTIONS;

/**
 * Espelho do FAQ visivel da landing (`landing.faq.items` em
 * `i18n/messages/en-US.json`, renderizado por
 * `src/components/landing/faq-section.tsx`), na mesma ordem das chaves.
 * O Google exige que o FAQPage repita a resposta que o visitante ve na pagina;
 * qualquer divergencia e structured data enganosa. A paridade e travada pelo
 * teste `src/__tests__/lib/seo/json-ld.test.ts`.
 */
export const LANDING_FAQ_SCHEMA: Array<{ question: string; answer: string }> = [
  { question: 'How long is each live lesson?', answer: 'Every live lesson lasts 50 minutes, every time, so focus, pace and learning stay productive.' },
  { question: 'Can I cancel or reschedule?', answer: 'Yes, up to 24h before. Later than that, the credit is used.' },
  { question: 'How long are pack credits valid?', answer: '6 months from purchase. Monthly credits follow the billing cycle.' },
  { question: 'What is the difference between Pack 10 and Monthly?', answer: `Pack 10 is 10 credits you use when you want (6-month expiry). Monthly is ${MONTHLY_10.lessons} lessons at ${formatUsd(MONTHLY_10.per, SCHEMA_COPY_LOCALE)} or ${MONTHLY_20.lessons} lessons at ${formatUsd(MONTHLY_20.per, SCHEMA_COPY_LOCALE)} per lesson, billed each cycle. Cancel at cycle end.` },
  { question: 'Do I need to know Portuguese already?', answer: 'No. We start from zero. Lessons can run in English, Spanish or Italian until Portuguese takes over.' },
  { question: 'I have a trip, a move or an interview soon. Can we go faster?', answer: 'Yes. Intensive plan: conversation, priority vocabulary, frequent mistakes, weekly goals.' },
  { question: 'Do you teach Portuguese for work?', answer: 'Yes. Meetings, emails, presentations, interviews, negotiation and field vocabulary. Background in business admin and software.' },
  { question: 'Brazilian or European Portuguese?', answer: 'Brazilian only. The Portuguese Brazilians actually speak.' },
  { question: 'How does the first-lesson price work?', answer: `${formatUsd(FIRST_LESSON_USD, SCHEMA_COPY_LOCALE)} once per new student (50% off ${formatUsd(SINGLE_USD, SCHEMA_COPY_LOCALE)}). In that lesson we map your level, goals and blockers and set a simple plan.` },
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
