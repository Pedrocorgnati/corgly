import { NextRequest, NextResponse } from 'next/server';
import { availabilityService } from '@/services/availability.service';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { requireAdmin } from '@/lib/auth-guard';

/** PATCH /api/v1/availability/[id]/unblock */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // RESOLVED: Auth bypass
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    await availabilityService.unblockSlot(id);
    return NextResponse.json(apiResponse(null, null, 'Slot desbloqueado.'));
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
