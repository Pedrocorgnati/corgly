import { NextRequest, NextResponse } from 'next/server';
import { ConfirmEmailSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';

/** POST /api/v1/auth/confirm-email */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ConfirmEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(apiResponse(null, 'Token inválido.'), { status: 400 });
    }

    await authService.confirmEmail(parsed.data.token);
    return NextResponse.json(apiResponse(null, null, 'Email confirmado com sucesso.'));
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_TOKEN') {
      return NextResponse.json(
        apiResponse(null, 'Token inválido ou expirado.'),
        { status: 400 },
      );
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
