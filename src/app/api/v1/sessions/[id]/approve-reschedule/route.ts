import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@/lib/constants/enums';
import { sessionService } from '@/services/session.service';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';

/** PATCH /api/v1/sessions/[id]/approve-reschedule (ADMIN only) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = request.headers.get('x-user-role');
  if (role !== UserRole.ADMIN) {
    return NextResponse.json(apiResponse(null, 'Acesso restrito a administradores.'), { status: 403 });
  }

  try {
    const { id } = await params;
    const result = await sessionService.approveReschedule(id);
    return NextResponse.json(apiResponse(result, null, 'Reagendamento aprovado.'));
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
