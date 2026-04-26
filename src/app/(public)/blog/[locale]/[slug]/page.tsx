import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { localeToSupportedLanguage, locales, type Locale } from '../../../../../../i18n/config';

export const revalidate = 300;

interface PageParams { locale: Locale; slug: string }

export async function generateStaticParams() {
  const rows = await prisma.contentTranslation.findMany({
    where:   { content: { status: 'PUBLISHED' } },
    select:  { locale: true, slug: true },
    take:    500,
  }).catch(() => []);
  return rows.map((r) => {
    const map: Record<string, Locale> = {
      PT_BR: 'pt-BR', EN_US: 'en-US', ES_ES: 'es-ES', IT_IT: 'it-IT',
    };
    return { locale: map[r.locale] ?? 'en-US', slug: r.slug };
  });
}

async function loadPost(locale: Locale, slug: string, allowPreview: boolean) {
  const lang = localeToSupportedLanguage(locale);
  const translation = await prisma.contentTranslation.findUnique({
    where:   { locale_slug: { locale: lang, slug } },
    include: { content: true },
  });
  if (!translation) return null;
  if (!allowPreview && translation.content.status !== 'PUBLISHED') return null;
  return translation;
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!locales.includes(locale)) return {};
  const post = await loadPost(locale, slug, false);
  if (!post) return {};
  return {
    title:       post.title,
    description: post.excerpt ?? undefined,
    openGraph:   { title: post.title, description: post.excerpt ?? undefined, type: 'article' },
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

  const post = await loadPost(locale, slug, preview === '1');
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      {preview === '1' && post.content.status !== 'PUBLISHED' && (
        <div className="mb-6 rounded-lg bg-warning/10 border border-warning text-warning p-3 text-sm">
          Pré-visualização — status: {post.content.status}
        </div>
      )}
      <h1 className="text-3xl font-bold text-foreground mb-2">{post.title}</h1>
      {post.excerpt && <p className="text-muted-foreground mb-6">{post.excerpt}</p>}
      {post.content.publishedAt && (
        <p className="text-xs text-muted-foreground mb-6">
          {new Date(post.content.publishedAt).toLocaleDateString(locale)}
        </p>
      )}
      <div
        className="prose prose-neutral max-w-none"
        dangerouslySetInnerHTML={{ __html: post.body }}
      />
    </article>
  );
}
