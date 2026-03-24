import { NextRequest, NextResponse } from 'next/server';
import { availabilityService } from '@/services/availability.service';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { requireAdmin } from '@/lib/auth-guard';

/** DELETE /api/v1/availability/:id — admin: delete empty slot */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // RESOLVED: Auth bypass
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    await availabilityService.deleteEmpty(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
