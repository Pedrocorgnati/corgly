import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { safeTemplateHtmlSchema } from '@/lib/email/email-template.schema';
import {
  BROADCAST_SEGMENTS,
  sendBroadcast,
  listBroadcastDeliveries,
} from '@/lib/email/email-delivery.service';

const AUDIT_ACTION = 'broadcast_sent';
const AUDIT_RESOURCE = 'email_broadcast';

const sendSchema = z.object({
  segment: z.enum(BROADCAST_SEGMENTS),
  subject: z.string().trim().min(1, 'Assunto obrigatorio.').max(180, 'Assunto excede 180 caracteres.'),
  html: safeTemplateHtmlSchema,
  // Confirmacao explicita obrigatoria (acceptance: "com confirmacao").
  confirm: z.literal(true),
});

/**
 * POST /api/v1/admin/broadcasts
 * Dispara um broadcast de marketing para um segmento permitido. Exige
 * `confirm: true`. Cada entrega gera um registro EmailDelivery (provider id,
 * status, erro). Opt-out e respeitado (SKIPPED, sem envio).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const json = await request.json().catch(() => null);
  const parsed = sendSchema.safeParse(json);
  if (!parsed.success) {
    const confirmIssue = parsed.error.issues.find((i) => i.path[0] === 'confirm');
    const message = confirmIssue
      ? 'Confirmacao obrigatoria para enviar o broadcast.'
      : (parsed.error.issues[0]?.message ?? 'Dados invalidos.');
    return NextResponse.json(apiResponse(null, message), { status: 400 });
  }

  const { segment, subject, html } = parsed.data;

  try {
    const result = await sendBroadcast({ segment, subject, html, adminId: auth.id });

    await prisma.auditLog
      .create({
        data: {
          adminId: auth.id,
          action: AUDIT_ACTION,
          resourceType: AUDIT_RESOURCE,
          resourceId: result.broadcastId,
          metadata: {
            segment: result.segment,
            subject,
            total: result.total,
            sent: result.sent,
            failed: result.failed,
            skipped: result.skipped,
            capped: result.capped,
          },
        },
      })
      .catch(() => null);

    return NextResponse.json(apiResponse(result), { status: 201 });
  } catch (err) {
    console.error('POST /admin/broadcasts', err);
    return NextResponse.json(apiResponse(null, 'Erro ao disparar o broadcast.'), { status: 500 });
  }
}

/**
 * GET /api/v1/admin/broadcasts            -> historico de broadcasts (AuditLog)
 * GET /api/v1/admin/broadcasts?broadcastId=ID -> entregas (log) de um broadcast
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const broadcastId = searchParams.get('broadcastId');

  if (broadcastId) {
    try {
      const deliveries = await listBroadcastDeliveries(broadcastId);
      return NextResponse.json(apiResponse({ broadcastId, deliveries }));
    } catch (err) {
      console.error('GET /admin/broadcasts (deliveries)', err);
      return NextResponse.json(apiResponse(null, 'Erro ao carregar entregas.'), { status: 500 });
    }
  }

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get('pageSize') ?? '20', 10)));

  try {
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where: { action: AUDIT_ACTION, resourceType: AUDIT_RESOURCE } }),
      prisma.auditLog.findMany({
        where: { action: AUDIT_ACTION, resourceType: AUDIT_RESOURCE },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { resourceId: true, adminId: true, metadata: true, createdAt: true },
      }),
    ]);

    const items = logs.map((log) => {
      const meta = (log.metadata ?? {}) as Record<string, unknown>;
      return {
        broadcastId: log.resourceId,
        adminId: log.adminId,
        createdAt: log.createdAt,
        segment: typeof meta.segment === 'string' ? meta.segment : null,
        subject: typeof meta.subject === 'string' ? meta.subject : null,
        total: typeof meta.total === 'number' ? meta.total : 0,
        sent: typeof meta.sent === 'number' ? meta.sent : 0,
        failed: typeof meta.failed === 'number' ? meta.failed : 0,
        skipped: typeof meta.skipped === 'number' ? meta.skipped : 0,
      };
    });

    return NextResponse.json(apiResponse({ total, page, pageSize, items }));
  } catch (err) {
    console.error('GET /admin/broadcasts', err);
    return NextResponse.json(apiResponse(null, 'Erro ao carregar broadcasts.'), { status: 500 });
  }
}
