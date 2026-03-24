import { NextRequest, NextResponse } from 'next/server';
import { CancelSessionSchema } from '@/schemas/session.schema';
import { sessionService } from '@/services/session.service';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';

/** PATCH /api/v1/sessions/[id]/cancel */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = request.headers.get('x-user-id')!;
  const role = request.headers.get('x-user-role')!;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = CancelSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(apiResponse(null, 'Dados inválidos.'), { status: 400 });
    }

    const session = await sessionService.cancel(id, userId, role, parsed.data);
    return NextResponse.json(apiResponse(session, null, 'Aula cancelada.'));
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
