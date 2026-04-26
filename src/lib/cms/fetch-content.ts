import 'server-only';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { localeToSupportedLanguage, type Locale } from '../../../i18n/config';

export interface CmsPost {
  id:          string;
  title:       string;
  slug:        string;
  excerpt:     string | null;
  body:        string;
  category:    string | null;
  publishedAt: Date | null;
}

export interface CmsListResult {
  items: CmsPost[];
  total: number;
  page:  number;
  pageSize: number;
}

async function _getContentBySlug(locale: Locale, slug: string): Promise<CmsPost | null> {
  const lang = localeToSupportedLanguage(locale);
  const translation = await prisma.contentTranslation.findUnique({
    where:   { locale_slug: { locale: lang, slug } },
    include: { content: true },
  });
  if (!translation) return null;
  if (translation.content.status !== 'PUBLISHED') return null;
  return {
    id:          translation.content.id,
    title:       translation.title,
    slug:        translation.slug,
    excerpt:     translation.excerpt,
    body:        translation.body,
    category:    translation.content.category,
    publishedAt: translation.content.publishedAt,
  };
}

export const getContentBySlug = unstable_cache(
  _getContentBySlug,
  ['cms:get-by-slug'],
  { revalidate: 3600, tags: ['cms'] },
);

async function _listContent(
  locale: Locale,
  opts: { category?: string; page?: number; pageSize?: number } = {},
): Promise<CmsListResult> {
  const lang = localeToSupportedLanguage(locale);
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, opts.pageSize ?? 10));
  const where = {
    locale:  lang,
    content: {
      status: 'PUBLISHED' as const,
      ...(opts.category ? { category: opts.category } : {}),
    },
  };
  const [total, rows] = await Promise.all([
    prisma.contentTranslation.count({ where }),
    prisma.contentTranslation.findMany({
      where,
      include: { content: true },
      orderBy: { content: { publishedAt: 'desc' } },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
  ]);
  return {
    page, pageSize, total,
    items: rows.map((t) => ({
      id:          t.content.id,
      title:       t.title,
      slug:        t.slug,
      excerpt:     t.excerpt,
      body:        t.body,
      category:    t.content.category,
      publishedAt: t.content.publishedAt,
    })),
  };
}

export const listContent = unstable_cache(
  _listContent,
  ['cms:list'],
  { revalidate: 3600, tags: ['cms'] },
);
