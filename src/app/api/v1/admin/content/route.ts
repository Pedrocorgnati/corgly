import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { slugify } from '@/lib/content/slug';
import { sanitizeTiptapHtml } from '@/lib/content/sanitize-html';

const LOCALES = ['PT_BR', 'EN_US', 'ES_ES', 'IT_IT'] as const;

const translationSchema = z.object({
  locale:  z.enum(LOCALES),
  title:   z.string().min(1).max(190),
  slug:    z.string().min(1).max(200).optional(),
  excerpt: z.string().max(500).optional().nullable(),
  body:    z.string().max(200000).default(''),
});

const createSchema = z.object({
  type:         z.enum(['VIDEO', 'ARTICLE']).default('ARTICLE'),
  title:        z.string().min(1).max(190),
  category:     z.string().max(80).optional().nullable(),
  status:       z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  publishedAt:  z.string().datetime().optional().nullable(),
  language:     z.enum(LOCALES).default('PT_BR'),
  youtubeUrl:   z.string().url().optional().nullable(),
  translations: z.array(translationSchema).min(1),
});

/**
 * GET /api/v1/admin/content?status=&locale=&q=&page=&pageSize=
 * List content with translations (admin).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const status  = searchParams.get('status') ?? undefined;
  const locale  = searchParams.get('locale') ?? undefined;
  const q       = searchParams.get('q') ?? undefined;
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get('pageSize') ?? '20', 10)));

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(q ? { title: { contains: q } } : {}),
    ...(locale ? { translations: { some: { locale: locale as never } } } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.content.count({ where }),
    prisma.content.findMany({
      where,
      include: { translations: { select: { locale: true, title: true, slug: true } } },
      orderBy: { updatedAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
  ]);

  return NextResponse.json(apiResponse({ total, page, pageSize, items }));
}

/**
 * POST /api/v1/admin/content — create content + translations.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(apiResponse(null, 'Dados invalidos.'), { status: 400 });
  }
  const data = parsed.data;

  const translations = data.translations.map((t) => ({
    locale:  t.locale,
    title:   t.title,
    slug:    t.slug ? slugify(t.slug) : slugify(t.title),
    excerpt: t.excerpt ?? null,
    body:    sanitizeTiptapHtml(t.body ?? ''),
  }));

  try {
    const created = await prisma.content.create({
      data: {
        type:        data.type,
        title:       data.title,
        category:    data.category ?? null,
        status:      data.status,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
        language:    data.language,
        youtubeUrl:  data.youtubeUrl ?? null,
        authorId:    auth.id,
        translations: { create: translations },
      },
      include: { translations: true },
    });

    await prisma.auditLog.create({
      data: {
        adminId:      auth.id,
        action:       'content_created',
        resourceType: 'content',
        resourceId:   created.id,
        metadata:     { status: created.status, locales: translations.map((t) => t.locale) },
      },
    }).catch(() => null);

    return NextResponse.json(apiResponse(created), { status: 201 });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      return NextResponse.json(apiResponse(null, 'Slug ja em uso para este locale.'), { status: 409 });
    }
    console.error('POST /admin/content', err);
    return NextResponse.json(apiResponse(null, 'Erro ao criar conteudo.'), { status: 500 });
  }
}
