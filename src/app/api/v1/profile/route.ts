import { NextRequest, NextResponse } from 'next/server';
import { UpdateProfileSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';
import { requireAuth } from '@/lib/auth-guard';

/** PATCH /api/v1/profile */
export async function PATCH(request: NextRequest) {
  // RESOLVED: Auth bypass — usar requireAuth em vez de header check direto
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = UpdateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const updated = await authService.updateProfile(auth.id, parsed.data);
    return NextResponse.json(apiResponse(updated));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
