import { NextRequest, NextResponse } from 'next/server';
import { LoginSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { setAuthCookie, apiResponse } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/** POST /api/v1/auth/login */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = checkRateLimit(`login:${ip}`, RATE_LIMITS.AUTH_LOGIN);
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas tentativas. Aguarde 1 minuto.'),
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(apiResponse(null, 'Email ou senha inválidos.'), { status: 400 });
    }

    const result = await authService.login(parsed.data);
    const response = NextResponse.json(apiResponse(result, null, 'Login realizado com sucesso.'));
    setAuthCookie(response, (result as unknown as { token: string }).token);
    return response;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      return NextResponse.json(apiResponse(null, 'Email ou senha incorretos.'), { status: 401 });
    }
    if (err instanceof Error && err.message === 'EMAIL_NOT_CONFIRMED') {
      return NextResponse.json(
        apiResponse(null, 'Confirme seu email antes de fazer login.'),
        { status: 403 },
      );
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
