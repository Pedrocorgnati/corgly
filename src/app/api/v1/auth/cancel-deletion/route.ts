import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';

/** GET /api/v1/auth/cancel-deletion?token= */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json(apiResponse(null, 'Token inválido.'), { status: 400 });
  }

  try {
    await authService.cancelDeletion(token);
    return NextResponse.json(apiResponse(null, null, 'Exclusão cancelada com sucesso.'));
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_TOKEN') {
      return NextResponse.json(apiResponse(null, 'Link inválido ou expirado.'), { status: 400 });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
