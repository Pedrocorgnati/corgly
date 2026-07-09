import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { locales, defaultLocale, localeToSupportedLanguage, type Locale } from '../../../../../../i18n/config';

export const revalidate = 0;

const STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const;
type ContentStatus = (typeof STATUSES)[number];

/** Query do contrato editorial multi-locale (task 062 / T-061, §12.4.3). */
const ArticlesQuerySchema = z.object({
  locale:   z.enum(locales).default(defaultLocale),
  tag:      z.string().trim().min(1).max(80).optional(),
  status:   z.enum(STATUSES).default('PUBLISHED'),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(10),
});

/**
 * GET /api/v1/content/articles?locale=pt-BR&tag=...&status=PUBLISHED&page=1&pageSize=10
 *
 * Lista artigos (Content.type = ARTICLE) por locale, tag (category), status e paginacao.
 * Publico retorna apenas PUBLISHED. Statuses nao publicos (DRAFT/SCHEDULED/ARCHIVED)
 * exigem ADMIN - evita vazamento de rascunhos via parametro de query.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = ArticlesQuerySchema.safeParse({
    locale:   searchParams.get('locale')   ?? undefined,
    tag:      searchParams.get('tag')       ?? undefined,
    status:   searchParams.get('status')    ?? undefined,
    page:     searchParams.get('page')      ?? undefined,
    pageSize: searchParams.get('pageSize')  ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Parametros invalidos.', parsed.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const { locale, tag, status, page, pageSize } = parsed.data;

  // Endpoint publico: apenas PUBLISHED e servivel. Statuses nao-publicos
  // (DRAFT/SCHEDULED/ARCHIVED) exigiriam identidade admin, que o middleware
  // do prefixo publico /api/v1/content nao injeta nesta rota. Em vez de manter
  // um gate de auth morto (sempre 401), recusamos explicitamente - fail-closed,
  // sem vazamento de rascunho e sem sugerir uma capacidade que nao funciona.
  if (status !== 'PUBLISHED') {
    return NextResponse.json(
      apiResponse(null, 'Apenas artigos PUBLISHED estao disponiveis neste endpoint publico.'),
      { status: 403 },
    );
  }

  const lang = localeToSupportedLanguage(locale as Locale);

  const where = {
    locale: lang,
    content: {
      type:   'ARTICLE' as const,
      status: status as ContentStatus,
      ...(tag ? { category: tag } : {}),
    },
  };

  try {
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

    const items = rows.map((t) => ({
      id:          t.content.id,
      title:       t.title,
      slug:        t.slug,
      excerpt:     t.excerpt,
      locale,
      tag:         t.content.category,
      status:      t.content.status,
      publishedAt: t.content.publishedAt,
    }));

    return NextResponse.json(
      apiResponse({
        items,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      }),
    );
  } catch (err) {
    logger.error('GET /api/v1/content/articles', { action: 'content.articles.list' }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
