import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { refundRequestService } from '@/lib/billing/refund-request.service';

const RefundRequestSchema = z.object({
  paymentId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(1000),
});

function appErrorResponse(error: AppError) {
  return NextResponse.json(
    {
      ...apiResponse(null, error.message),
      code: error.code,
    },
    { status: error.status },
  );
}

/** GET /api/v1/billing/refund-requests?paymentId=... - consulta replay existente. */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const paymentId = request.nextUrl.searchParams.get('paymentId')?.trim() ?? '';

    if (!paymentId) {
      return NextResponse.json(apiResponse(null, 'paymentId obrigatório.'), { status: 400 });
    }

    const refundRequest = await refundRequestService.getExistingForPayment(
      authResult.id,
      paymentId,
    );

    return NextResponse.json(apiResponse({ refundRequest }));
  } catch (err) {
    if (err instanceof AppError) return appErrorResponse(err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/billing/refund-requests - registra pedido de reembolso do aluno. */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(apiResponse(null, 'Body inválido.'), { status: 400 });
    }

    const parsed = RefundRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const result = await refundRequestService.requestRefund({
      userId: authResult.id,
      paymentId: parsed.data.paymentId,
      reason: parsed.data.reason,
    });

    return NextResponse.json(
      apiResponse(
        result,
        null,
        result.idempotentReplay
          ? 'Pedido de reembolso já registrado anteriormente.'
          : 'Pedido de reembolso registrado com sucesso.',
      ),
      { status: result.idempotentReplay ? 200 : 201 },
    );
  } catch (err) {
    if (err instanceof AppError) return appErrorResponse(err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
