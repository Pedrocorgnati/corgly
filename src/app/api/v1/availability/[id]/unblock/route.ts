import { NextRequest, NextResponse } from 'next/server';
import { availabilityService } from '@/services/availability.service';
import { apiResponse } from '@/lib/auth';

/** PATCH /api/v1/availability/[id]/unblock */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = request.headers.get('x-user-role');
  if (role !== 'ADMIN') {
    return NextResponse.json(apiResponse(null, 'Acesso restrito a administradores.'), { status: 403 });
  }

  try {
    const { id } = await params;
    await availabilityService.unblockSlot(id);
    return NextResponse.json(apiResponse(null, null, 'Slot desbloqueado.'));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
