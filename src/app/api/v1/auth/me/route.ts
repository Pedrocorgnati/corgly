import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';

/** GET /api/v1/auth/me */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json(apiResponse(null, 'Não autorizado.'), { status: 401 });
  }

  try {
    const user = await authService.getMe(userId);
    if (!user) {
      return NextResponse.json(apiResponse(null, 'Usuário não encontrado.'), { status: 404 });
    }
    return NextResponse.json(apiResponse(user));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
