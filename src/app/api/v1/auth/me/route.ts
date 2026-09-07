import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';
import { creditService } from '@/services/credit.service';
import { apiResponse } from '@/lib/auth';

/**
 * GET /api/v1/auth/me
 *
 * Devolve o perfil da sessao MAIS o saldo de creditos. O saldo entra aqui
 * porque `AuthUser` (src/lib/data/auth.ts) declara `creditBalance` obrigatorio
 * e todo consumidor da area logada (layout do aluno, app shell, header,
 * sidebar, /schedule) o le desse mesmo objeto — sem ele o campo chegava
 * `undefined` e o aluno com credito era tratado como sem credito.
 *
 * O calculo NAO e reimplementado: delega em `CreditService.getBalance`, unica
 * fonte de verdade do saldo (soma lotes nao expirados com credito sobrando).
 */
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

    // Sequencial de proposito: usuario inexistente nao dispara query de saldo.
    const creditBalance = await creditService.getBalance(userId);

    return NextResponse.json(apiResponse({ ...user, creditBalance }));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
