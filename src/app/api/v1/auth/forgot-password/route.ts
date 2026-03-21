import { NextRequest, NextResponse } from 'next/server';
import { ForgotPasswordSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/** POST /api/v1/auth/forgot-password */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = checkRateLimit(`forgot:${ip}`, RATE_LIMITS.AUTH_FORGOT);
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas tentativas. Aguarde 15 minutos.'),
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const parsed = ForgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      // Always 200 to prevent email enumeration
      return NextResponse.json(
        apiResponse(null, null, 'Se o email existir, você receberá as instruções em breve.'),
      );
    }

    await authService.forgotPassword(parsed.data.email);
    return NextResponse.json(
      apiResponse(null, null, 'Se o email existir, você receberá as instruções em breve.'),
    );
  } catch {
    return NextResponse.json(
      apiResponse(null, null, 'Se o email existir, você receberá as instruções em breve.'),
    );
  }
}
