import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { ROUTES } from '@/lib/constants/routes';
import { paymentMethodsService } from '@/lib/billing/payment-methods.service';

const SetDefaultPaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(3).max(120),
});

function supportCtaFor(error: AppError) {
  if (error.code !== 'PAYMENT_070') return null;
  return {
    label: 'Falar com suporte',
    href: ROUTES.SUPPORT,
  };
}

function appErrorResponse(error: AppError) {
  const supportCta = supportCtaFor(error);
  return NextResponse.json(
    {
      ...apiResponse(supportCta ? { supportCta } : null, error.message),
      code: error.code,
    },
    { status: error.status },
  );
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const result = await paymentMethodsService.listForUser(authResult.id);
    return NextResponse.json(apiResponse(result));
  } catch (err) {
    if (err instanceof AppError) return appErrorResponse(err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = SetDefaultPaymentMethodSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const result = await paymentMethodsService.setDefaultForUser(
      authResult.id,
      parsed.data.paymentMethodId,
    );

    return NextResponse.json(
      apiResponse(result, null, 'Método de pagamento padrão atualizado.'),
    );
  } catch (err) {
    if (err instanceof AppError) return appErrorResponse(err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
