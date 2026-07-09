import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  emailTemplateBaseSchema,
  EMAIL_TEMPLATE_TYPES,
  EMAIL_TEMPLATE_LOCALES,
  EMAIL_CHANNELS,
  EMAIL_TEMPLATE_STATUSES,
} from '@/lib/email/email-template.schema';
import {
  nextTemplateVersion,
  recordTemplateAudit,
} from '@/lib/email/template-service';

/**
 * Colecao de email templates versionados (T-054 / ST002).
 *
 * GET  /api/v1/email-templates  -> lista templates (filtros type/locale/status/channel).
 * POST /api/v1/email-templates  -> cria uma nova versao (sempre em DRAFT).
 *
 * Todas as rotas exigem ADMIN (requireAdmin). Publicacao e arquivamento vivem
 * em PATCH /api/v1/email-templates/[id].
 */

// Novas versoes nascem em DRAFT; a versao e calculada pelo servidor.
const createVersionSchema = emailTemplateBaseSchema.omit({
  version: true,
  status: true,
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type');
  const locale = searchParams.get('locale');
  const status = searchParams.get('status');
  const channel = searchParams.get('channel');

  const where: Record<string, string> = {};
  if (type && (EMAIL_TEMPLATE_TYPES as readonly string[]).includes(type)) where.type = type;
  if (locale && (EMAIL_TEMPLATE_LOCALES as readonly string[]).includes(locale)) where.locale = locale;
  if (status && (EMAIL_TEMPLATE_STATUSES as readonly string[]).includes(status)) where.status = status;
  if (channel && (EMAIL_CHANNELS as readonly string[]).includes(channel)) where.channel = channel;

  try {
    const items = await prisma.emailTemplate.findMany({
      where,
      select: {
        id: true,
        type: true,
        locale: true,
        channel: true,
        version: true,
        status: true,
        subject: true,
        preheader: true,
        variables: true,
        publishedAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ type: 'asc' }, { locale: 'asc' }, { version: 'desc' }],
    });

    return NextResponse.json(apiResponse({ items, total: items.length }));
  } catch (err) {
    console.error('GET /email-templates', err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const json = await request.json().catch(() => null);
  const parsed = createVersionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados invalidos.'),
      { status: 400 },
    );
  }

  const data = parsed.data;
  const channel = data.channel ?? 'EMAIL';

  try {
    const version = await nextTemplateVersion({
      type: data.type,
      locale: data.locale,
      channel,
    });

    const created = await prisma.emailTemplate.create({
      data: {
        type: data.type,
        locale: data.locale,
        channel,
        version,
        status: 'DRAFT',
        subject: data.subject,
        preheader: data.preheader ?? null,
        htmlBody: data.htmlBody,
        textBody: data.textBody ?? null,
        variables: data.variables ?? [],
      },
    });

    await recordTemplateAudit({
      adminId: auth.id,
      action: 'email_template_created',
      templateId: created.id,
      type: created.type,
      locale: created.locale,
      channel: created.channel,
      version: created.version,
      status: created.status,
    });

    return NextResponse.json(apiResponse(created), { status: 201 });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      return NextResponse.json(
        apiResponse(null, 'Ja existe um template com este tipo, locale, canal e versao.'),
        { status: 409 },
      );
    }
    console.error('POST /email-templates', err);
    return NextResponse.json(apiResponse(null, 'Erro ao criar versao.'), { status: 500 });
  }
}
