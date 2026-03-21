import { NextRequest, NextResponse } from 'next/server';
import { BookSessionSchema } from '@/schemas/session.schema';
import { sessionService } from '@/services/session.service';
import { apiResponse } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/** GET /api/v1/sessions */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')!;
  const role = request.headers.get('x-user-role')!;
  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status') ?? undefined;

  try {
    if (role === 'ADMIN') {
      const hasFeedback = searchParams.get('hasFeedback');
      const result = await sessionService.listAll({
        status,
        hasFeedback: hasFeedback !== null ? hasFeedback === 'true' : undefined,
      });
      return NextResponse.json(apiResponse(result));
    }

    const sessions = await sessionService.listByStudent(userId, status);
    return NextResponse.json(apiResponse(sessions));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/sessions — book a session */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')!;
  const rl = checkRateLimit(`sessions:${userId}`, RATE_LIMITS.SESSIONS_CREATE);
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas tentativas. Aguarde 1 minuto.'),
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const parsed = BookSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const session = await sessionService.create(userId, parsed.data);
    return NextResponse.json(apiResponse(session, null, 'Aula agendada com sucesso.'), { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'INSUFFICIENT_CREDITS')
        return NextResponse.json(apiResponse(null, 'Créditos insuficientes.'), { status: 400 });
      if (err.message === 'SLOT_UNAVAILABLE')
        return NextResponse.json(apiResponse(null, 'Horário não disponível. Selecione outro.'), { status: 409 });
      if (err.message === 'MAX_FUTURE_SESSIONS')
        return NextResponse.json(apiResponse(null, 'Limite de aulas futuras atingido.'), { status: 400 });
      if (err.message === 'PAST_SLOT')
        return NextResponse.json(apiResponse(null, 'Horário no passado.'), { status: 400 });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
