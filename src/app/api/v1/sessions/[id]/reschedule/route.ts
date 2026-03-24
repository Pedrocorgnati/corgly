import { NextRequest, NextResponse } from 'next/server';
import { RescheduleSessionSchema } from '@/schemas/session.schema';
import { sessionService } from '@/services/session.service';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';

/** PATCH /api/v1/sessions/[id]/reschedule */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = request.headers.get('x-user-id')!;
  const role = request.headers.get('x-user-role')!;

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = RescheduleSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const result = await sessionService.reschedule(id, userId, role, parsed.data);
    return NextResponse.json(apiResponse(result, null, 'Reagendamento solicitado.'));
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    if (err instanceof Error && err.message === 'SLOT_NOT_FOUND') {
      return NextResponse.json(apiResponse(null, 'Slot não encontrado.'), { status: 404 });
    }
    if (err instanceof Error && err.message === 'SLOT_UNAVAILABLE') {
      return NextResponse.json(apiResponse(null, 'Horário não disponível.'), { status: 409 });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
