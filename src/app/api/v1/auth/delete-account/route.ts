import { NextRequest, NextResponse } from 'next/server';
import { DeleteAccountSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { clearAuthCookie, apiResponse } from '@/lib/auth';

/** POST /api/v1/auth/delete-account */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json(apiResponse(null, 'Não autorizado.'), { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = DeleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados inválidos.'),
        { status: 400 },
      );
    }

    await authService.deleteAccount(userId, parsed.data);
    const response = NextResponse.json(
      apiResponse(null, null, 'Conta marcada para exclusão. Você receberá um email de confirmação.'),
    );
    clearAuthCookie(response);
    return response;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      return NextResponse.json(apiResponse(null, 'Senha incorreta.'), { status: 401 });
    }
    if (err instanceof Error && err.message === 'ACTIVE_CREDITS') {
      const credits = (err as Error & { credits?: unknown[] }).credits ?? [];
      return NextResponse.json(
        apiResponse(null, `Você tem ${credits.length} lote(s) de créditos ativos. Utilize-os antes de excluir a conta.`),
        { status: 409 },
      );
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
