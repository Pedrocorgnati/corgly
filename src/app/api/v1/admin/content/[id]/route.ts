import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { slugify } from '@/lib/content/slug';
import { sanitizeTiptapHtml } from '@/lib/content/sanitize-html';

const LOCALES = ['PT_BR', 'EN_US', 'ES_ES', 'IT_IT'] as const;

const updateSchema = z.object({
  type:         z.enum(['VIDEO', 'ARTICLE']).optional(),
  title:        z.string().min(1).max(190).optional(),
  category:     z.string().max(80).nullable().optional(),
  status:       z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).optional(),
  publishedAt:  z.string().datetime().nullable().optional(),
  youtubeUrl:   z.string().url().nullable().optional(),
  translations: z.array(z.object({
    locale:  z.enum(LOCALES),
    title:   z.string().min(1).max(190),
    slug:    z.string().min(1).max(200).optional(),
    excerpt: z.string().max(500).nullable().optional(),
    body:    z.string().max(200000).default(''),
  })).optional(),
});

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const content = await prisma.content.findUnique({
    where:   { id },
    include: { translations: true },
  });
  if (!content) return NextResponse.json(apiResponse(null, 'Nao encontrado.'), { status: 404 });
  return NextResponse.json(apiResponse(content));
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const json = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(apiResponse(null, 'Dados invalidos.'), { status: 400 });
  }
  const data = parsed.data;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const base = await tx.content.update({
        where: { id },
        data:  {
          ...(data.type && { type: data.type }),
          ...(data.title && { title: data.title }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.status && { status: data.status }),
          ...(data.publishedAt !== undefined && { publishedAt: data.publishedAt ? new Date(data.publishedAt) : null }),
          ...(data.youtubeUrl !== undefined && { youtubeUrl: data.youtubeUrl }),
        },
      });

      if (data.translations) {
        for (const t of data.translations) {
          const slug = t.slug ? slugify(t.slug) : slugify(t.title);
          const safeBody = sanitizeTiptapHtml(t.body ?? '');
          await tx.contentTranslation.upsert({
            where:  { contentId_locale: { contentId: id, locale: t.locale } },
            create: { contentId: id, locale: t.locale, title: t.title, slug, excerpt: t.excerpt ?? null, body: safeBody },
            update: { title: t.title, slug, excerpt: t.excerpt ?? null, body: safeBody },
          });
        }
      }
      return base;
    });

    await prisma.auditLog.create({
      data: {
        adminId:      auth.id,
        action:       'content_updated',
        resourceType: 'content',
        resourceId:   id,
        metadata:     { status: updated.status },
      },
    }).catch(() => null);

    return NextResponse.json(apiResponse(updated));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      return NextResponse.json(apiResponse(null, 'Slug ja em uso para este locale.'), { status: 409 });
    }
    console.error('PUT /admin/content/[id]', err);
    return NextResponse.json(apiResponse(null, 'Erro ao atualizar.'), { status: 500 });
  }
}

/**
 * DELETE — soft delete (status=ARCHIVED).
 */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const archived = await prisma.content.update({
    where: { id },
    data:  { status: 'ARCHIVED' },
  }).catch(() => null);
  if (!archived) return NextResponse.json(apiResponse(null, 'Nao encontrado.'), { status: 404 });

  await prisma.auditLog.create({
    data: {
      adminId:      auth.id,
      action:       'content_archived',
      resourceType: 'content',
      resourceId:   id,
      metadata:     {},
    },
  }).catch(() => null);

  return NextResponse.json(apiResponse({ id, status: 'ARCHIVED' }));
}
