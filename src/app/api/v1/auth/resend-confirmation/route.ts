import { NextRequest, NextResponse } from 'next/server';
import { ResendConfirmationSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const GENERIC_MESSAGE = 'Se este email estiver cadastrado e não confirmado, um novo link foi enviado.';

/** POST /api/v1/auth/resend-confirmation */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = checkRateLimit(`resend-confirm:${ip}`, RATE_LIMITS.AUTH_RESEND);
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas tentativas. Aguarde 15 minutos.'),
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const parsed = ResendConfirmationSchema.safeParse(body);
    if (!parsed.success) {
      // Always 200 to prevent email enumeration
      return NextResponse.json(apiResponse(null, null, GENERIC_MESSAGE));
    }

    await authService.resendConfirmation(parsed.data);
    return NextResponse.json(apiResponse(null, null, GENERIC_MESSAGE));
  } catch {
    return NextResponse.json(apiResponse(null, null, GENERIC_MESSAGE));
  }
}
