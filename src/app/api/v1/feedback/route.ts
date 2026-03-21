import { NextRequest, NextResponse } from 'next/server';
import { CreateFeedbackSchema } from '@/schemas/feedback.schema';
import { feedbackService } from '@/services/feedback.service';
import { apiResponse } from '@/lib/auth';

/** GET /api/v1/feedback?sessionId=X */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(apiResponse(null, 'sessionId obrigatório.'), { status: 400 });
  }

  try {
    const feedback = await feedbackService.getBySession(sessionId);
    return NextResponse.json(apiResponse(feedback));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/feedback (ADMIN only) */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')!;
  const role = request.headers.get('x-user-role');
  if (role !== 'ADMIN') {
    return NextResponse.json(apiResponse(null, 'Acesso restrito a administradores.'), { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = CreateFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const feedback = await feedbackService.create(userId, parsed.data);
    return NextResponse.json(apiResponse(feedback, null, 'Feedback registrado.'), { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'SESSION_NOT_COMPLETED')
        return NextResponse.json(apiResponse(null, 'Sessão não concluída.'), { status: 400 });
      if (err.message === 'FEEDBACK_WINDOW_EXPIRED')
        return NextResponse.json(apiResponse(null, 'Janela de feedback de 48h expirada.'), { status: 400 });
      if (err.message === 'FEEDBACK_EXISTS')
        return NextResponse.json(apiResponse(null, 'Feedback já registrado para esta sessão.'), { status: 409 });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
