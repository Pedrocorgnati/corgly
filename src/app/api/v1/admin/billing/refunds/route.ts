import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';
import { AppError } from '@/lib/errors';
import { refundAdminService } from '@/lib/billing/refund-admin.service';

const AdminDecisionSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(5),
});

const LegacyRefundSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.number().int().positive().optional(),
  reason: z.string().optional(),
  requestId: z.undefined().optional(),
  action: z.undefined().optional(),
});

const RouteBodySchema = z.union([AdminDecisionSchema, LegacyRefundSchema]);

/**
 * GET /api/v1/admin/billing/refunds
 * Lista pedidos de refund por status de aprovação administrativo.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const status = request.nextUrl.searchParams.get('status');
    const list = await refundAdminService.listRefundRequests(
      status ? (status === 'PENDING' ? 'PENDING' : status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : undefined) : undefined,
    );

    return NextResponse.json(apiResponse(list));
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(apiResponse(null, error.message, error.code), { status: error.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/**
 * POST /api/v1/admin/billing/refunds
 * 1) Novo fluxo: approve/reject de solicitação (obrigatório requestId + ação + reason)
 * 2) Backward compatible: POST legado por paymentId (mantido para testes e integrações existentes)
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = RouteBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, parsed.error.issues[0]?.message ?? 'Payload inválido.', 'REQUEST_INVALID'),
        { status: 400 },
      );
    }

    const body = parsed.data;

    if (
      'requestId' in body &&
      typeof body.requestId === 'string' &&
      typeof body.reason === 'string' &&
      (body.action === 'approve' || body.action === 'reject')
    ) {
      const decisionResult = await refundAdminService.decide(
        body.requestId,
        auth.id,
        body.action,
        body.reason,
        request.headers,
      );

      const statusCode = decisionResult.idempotentReplay ? 200 : 201;
      return NextResponse.json(
        apiResponse(
          {
            request: decisionResult.item,
            idempotentReplay: decisionResult.idempotentReplay,
          } as const,
          null,
          statusCode === 200 ? 'Decisão reprocessada.' : 'Decisão aplicada.',
        ),
        { status: statusCode },
      );
    }

    const legacyBody = LegacyRefundSchema.parse(body);
    const legacy = await refundAdminService.createPaymentRefund(
      legacyBody.paymentId,
      auth.id,
      legacyBody.amount,
      request.headers,
    );
    const statusCode = legacy.idempotentReplay ? 200 : 201;

    return NextResponse.json(
      apiResponse(
        {
          refund: {
            paymentId: legacy.result.paymentId,
            refundId: legacy.result.refundId,
            amount: legacy.result.amount,
            currency: legacy.result.currency,
            status: legacy.result.status,
          },
          idempotentReplay: legacy.idempotentReplay,
        },
        null,
        statusCode === 200 ? 'Reprocessado via key de idempotência.' : 'Reembolso registrado.',
      ),
      { status: statusCode },
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(apiResponse(null, error.message, error.code), { status: error.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
