import { NextRequest, NextResponse } from 'next/server';
import { ResetPasswordSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';

/** POST /api/v1/auth/reset-password */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ResetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(apiResponse(null, 'Dados inválidos.'), { status: 400 });
    }

    await authService.resetPassword(parsed.data.token, parsed.data.password);
    return NextResponse.json(apiResponse(null, null, 'Senha redefinida com sucesso.'));
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
