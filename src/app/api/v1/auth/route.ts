import { NextRequest, NextResponse } from 'next/server';
import { RegisterSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { setAuthCookie, apiResponse } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/** POST /api/v1/auth — alias for register */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = checkRateLimit(`register:${ip}`, RATE_LIMITS.AUTH_REGISTER);
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas tentativas. Aguarde e tente novamente.'),
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    await authService.register(parsed.data);
    return NextResponse.json(
      apiResponse(null, null, 'Conta criada. Verifique seu email para confirmar.'),
      { status: 201 },
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'EMAIL_ALREADY_EXISTS') {
      return NextResponse.json(apiResponse(null, 'Email já cadastrado.'), { status: 409 });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
