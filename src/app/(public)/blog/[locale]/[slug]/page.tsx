import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { localeToSupportedLanguage, locales, type Locale } from '../../../../../../i18n/config';

export const revalidate = 300;

interface PageParams { locale: Locale; slug: string }

const LANG_TO_LOCALE: Record<string, Locale> = {
  PT_BR: 'pt-BR', EN_US: 'en-US', ES_ES: 'es-ES', IT_IT: 'it-IT',
};

export async function generateStaticParams() {
  const rows = await prisma.contentTranslation.findMany({
    where:   { content: { status: 'PUBLISHED' } },
    select:  { locale: true, slug: true },
    take:    500,
  }).catch(() => []);
  return rows.map((r) => ({ locale: LANG_TO_LOCALE[r.locale] ?? 'en-US', slug: r.slug }));
}

/**
 * Resolve o post pelo slug no locale pedido; em ausencia, faz fallback para
 * qualquer outro locale com o mesmo slug (task 062 - "resolve slug por locale
 * e fallback"). Retorna tambem o locale efetivamente resolvido para sinalizar
 * quando o conteudo veio de um idioma diferente do pedido.
 */
async function loadPost(locale: Locale, slug: string, allowPreview: boolean) {
  const lang = localeToSupportedLanguage(locale);

  const exact = await prisma.contentTranslation.findUnique({
    where:   { locale_slug: { locale: lang, slug } },
    include: { content: true },
  });
  if (exact && (allowPreview || exact.content.status === 'PUBLISHED')) {
    return { translation: exact, resolvedLocale: locale, isFallback: false };
  }

  // Fallback: mesmo slug em outro locale (so PUBLISHED - preview nao atravessa locale).
  // orderBy deterministico: prioriza a publicacao mais recente para que a escolha
  // entre multiplos locales com o mesmo slug nao dependa da ordem do banco.
  const fallback = await prisma.contentTranslation.findFirst({
    where:   { slug, content: { status: 'PUBLISHED' } },
    include: { content: true },
    orderBy: { content: { publishedAt: 'desc' } },
  });
  if (!fallback) return null;

  return {
    translation:    fallback,
    resolvedLocale: LANG_TO_LOCALE[fallback.locale] ?? locale,
    isFallback:     true,
  };
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!locales.includes(locale)) return {};
  const resolved = await loadPost(locale, slug, false);
  if (!resolved) return {};
  const { translation, resolvedLocale } = resolved;
  return {
    title:       translation.title,
    description: translation.excerpt ?? undefined,
    alternates:  { canonical: `/blog/${resolvedLocale}/${translation.slug}` },
    openGraph:   {
      title:       translation.title,
      description: translation.excerpt ?? undefined,
      type:        'article',
      locale:      resolvedLocale,
      publishedTime: translation.content.publishedAt?.toISOString(),
    },
  };
}

export default async function BlogPostPage({
  params,
  searchParams,
}: {
  params:       Promise<PageParams>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { locale, slug } = await params;
  const { preview } = await searchParams;
  if (!locales.includes(locale)) notFound();

  const resolved = await loadPost(locale, slug, preview === '1');
  if (!resolved) notFound();

  const { translation: post, resolvedLocale, isFallback } = resolved;

  // SEO: structured data Article (schema.org/JSON-LD) - Acceptance task 062.
  const jsonLd = {
    '@context':     'https://schema.org',
    '@type':        'Article',
    headline:       post.title,
    description:    post.excerpt ?? undefined,
    inLanguage:     resolvedLocale,
    datePublished:  post.content.publishedAt?.toISOString(),
    dateModified:   post.updatedAt?.toISOString(),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id':   `/blog/${resolvedLocale}/${post.slug}`,
    },
  };

  return (
    <article data-testid="page-blog-post-detail" className="mx-auto max-w-3xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {preview === '1' && post.content.status !== 'PUBLISHED' && (
        <div data-testid="blog-post-detail-preview-banner" className="mb-6 rounded-lg bg-warning/10 border border-warning text-warning p-3 text-sm">
          Pré-visualização - status: {post.content.status}
        </div>
      )}

      {isFallback && (
        <div data-testid="blog-post-detail-fallback-banner" className="mb-6 rounded-lg bg-muted border border-border text-muted-foreground p-3 text-sm">
          Conteúdo indisponível em {locale}; exibindo a versão em {resolvedLocale}.
        </div>
      )}

      <div data-testid="blog-post-detail-header">
        <h1 className="text-3xl font-bold text-foreground mb-2">{post.title}</h1>
        {post.excerpt && <p className="text-muted-foreground mb-6">{post.excerpt}</p>}
        {post.content.publishedAt && (
          <p className="text-xs text-muted-foreground mb-6">
            {new Date(post.content.publishedAt).toLocaleDateString(resolvedLocale)}
          </p>
        )}
      </div>
      <div
        data-testid="blog-post-detail-content"
        className="prose prose-neutral max-w-none"
        dangerouslySetInnerHTML={{ __html: post.body }}
      />
    </article>
  );
}
