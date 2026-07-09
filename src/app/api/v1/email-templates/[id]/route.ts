import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  safeTemplateHtmlSchema,
  templateVariablesSchema,
} from '@/lib/email/email-template.schema';
import { recordTemplateAudit } from '@/lib/email/template-service';
import { renderTemplatePreview } from '@/lib/email/render-preview';

/**
 * Recurso individual de email template versionado (T-054 / ST002).
 *
 * GET   /api/v1/email-templates/[id]            -> detalhe + historico de versoes.
 * GET   /api/v1/email-templates/[id]?preview=1  -> + preview seguro renderizado.
 * PATCH /api/v1/email-templates/[id]            -> transicao de estado / edicao de rascunho.
 *
 * Acoes do PATCH (campo `action`):
 *   - update  : edita o rascunho (somente quando status == DRAFT).
 *   - publish : DRAFT -> ACTIVE (arquiva as demais ACTIVE da mesma tupla).
 *   - archive : DRAFT|ACTIVE -> ARCHIVED (estado terminal).
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

const patchSchema = z
  .object({
    action: z.enum(['update', 'publish', 'archive']),
    subject: z.string().trim().min(1).max(180).optional(),
    preheader: z.string().trim().max(180).optional(),
    htmlBody: safeTemplateHtmlSchema.optional(),
    textBody: z.string().trim().max(80_000).optional(),
    variables: templateVariablesSchema.optional(),
  })
  .refine(
    (d) =>
      d.action !== 'update' ||
      [d.subject, d.preheader, d.htmlBody, d.textBody, d.variables].some(
        (v) => v !== undefined,
      ),
    { message: 'Informe ao menos um campo para atualizar o rascunho.' },
  );

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const template = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json(apiResponse(null, 'Template nao encontrado.'), {
        status: 404,
      });
    }

    // Historico: todas as versoes da mesma tupla (type, locale, channel).
    const history = await prisma.emailTemplate.findMany({
      where: {
        type: template.type,
        locale: template.locale,
        channel: template.channel,
      },
      select: {
        id: true,
        version: true,
        status: true,
        publishedAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { version: 'desc' },
    });

    const wantsPreview = request.nextUrl.searchParams.get('preview');
    let preview = null;
    if (wantsPreview === '1' || wantsPreview === 'true') {
      const allowed = Array.isArray(template.variables)
        ? (template.variables as string[])
        : [];
      preview = renderTemplatePreview(template.htmlBody, allowed, {});
    }

    return NextResponse.json(apiResponse({ template, history, preview }));
  } catch (err) {
    console.error(`GET /email-templates/${id}`, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados invalidos.'),
      { status: 400 },
    );
  }
  const body = parsed.data;

  try {
    const current = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json(apiResponse(null, 'Template nao encontrado.'), {
        status: 404,
      });
    }

    // --- update (edicao de rascunho) ---
    if (body.action === 'update') {
      if (current.status !== 'DRAFT') {
        return NextResponse.json(
          apiResponse(null, 'Somente rascunhos podem ser editados.'),
          { status: 409 },
        );
      }
      const updated = await prisma.emailTemplate.update({
        where: { id },
        data: {
          ...(body.subject !== undefined && { subject: body.subject }),
          ...(body.preheader !== undefined && { preheader: body.preheader || null }),
          ...(body.htmlBody !== undefined && { htmlBody: body.htmlBody }),
          ...(body.textBody !== undefined && { textBody: body.textBody || null }),
          ...(body.variables !== undefined && { variables: body.variables }),
        },
      });
      await recordTemplateAudit({
        adminId: auth.id,
        action: 'email_template_updated',
        templateId: updated.id,
        type: updated.type,
        locale: updated.locale,
        channel: updated.channel,
        version: updated.version,
        status: updated.status,
      });
      return NextResponse.json(apiResponse(updated));
    }

    // --- publish (DRAFT -> ACTIVE) ---
    if (body.action === 'publish') {
      if (current.status !== 'DRAFT') {
        return NextResponse.json(
          apiResponse(null, 'Somente rascunhos podem ser publicados.'),
          { status: 409 },
        );
      }
      const published = await prisma.$transaction(async (tx) => {
        // Arquiva as demais versoes ACTIVE da mesma tupla (mantem uma ativa).
        await tx.emailTemplate.updateMany({
          where: {
            type: current.type,
            locale: current.locale,
            channel: current.channel,
            status: 'ACTIVE',
            id: { not: current.id },
          },
          data: { status: 'ARCHIVED', archivedAt: new Date() },
        });
        return tx.emailTemplate.update({
          where: { id },
          data: { status: 'ACTIVE', publishedAt: new Date() },
        });
      });
      await recordTemplateAudit({
        adminId: auth.id,
        action: 'email_template_published',
        templateId: published.id,
        type: published.type,
        locale: published.locale,
        channel: published.channel,
        version: published.version,
        status: published.status,
      });
      return NextResponse.json(apiResponse(published));
    }

    // --- archive (DRAFT|ACTIVE -> ARCHIVED) ---
    if (current.status === 'ARCHIVED') {
      return NextResponse.json(
        apiResponse(null, 'Template ja esta arquivado.'),
        { status: 409 },
      );
    }
    const archived = await prisma.emailTemplate.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    await recordTemplateAudit({
      adminId: auth.id,
      action: 'email_template_archived',
      templateId: archived.id,
      type: archived.type,
      locale: archived.locale,
      channel: archived.channel,
      version: archived.version,
      status: archived.status,
    });
    return NextResponse.json(apiResponse(archived));
  } catch (err) {
    console.error(`PATCH /email-templates/${id}`, err);
    return NextResponse.json(apiResponse(null, 'Erro ao atualizar template.'), {
      status: 500,
    });
  }
}
