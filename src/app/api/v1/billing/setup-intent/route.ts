import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { ROUTES } from '@/lib/constants/routes';
import { paymentMethodsService } from '@/lib/billing/payment-methods.service';

function supportCtaFor(error: AppError) {
  if (error.code !== 'PAYMENT_070') return null;
  return {
    label: 'Falar com suporte',
    href: ROUTES.SUPPORT,
  };
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const setupIntent = await paymentMethodsService.createSetupIntentForUser(authResult.id);
    return NextResponse.json(
      apiResponse(setupIntent, null, 'SetupIntent criado para o customer autenticado.'),
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AppError) {
      const supportCta = supportCtaFor(err);
      return NextResponse.json(
        {
          ...apiResponse(supportCta ? { supportCta } : null, err.message),
          code: err.code,
        },
        { status: err.status },
      );
    }

    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
