import { NextRequest, NextResponse } from 'next/server';
import { UpdateProfileSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';

/** PATCH /api/v1/profile */
export async function PATCH(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json(apiResponse(null, 'Não autorizado.'), { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = UpdateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const updated = await authService.updateProfile(userId, parsed.data);
    return NextResponse.json(apiResponse(updated));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
