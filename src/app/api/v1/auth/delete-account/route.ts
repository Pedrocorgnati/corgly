import { NextRequest, NextResponse } from 'next/server';
import { DeleteAccountSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { clearAuthCookie, apiResponse } from '@/lib/auth';

/**
 * Recusa de exclusao de conta, no contrato de erro por CODIGO.
 *
 * Esta rota emitia a prosa em pt-BR direto no `error` do envelope ("Senha
 * incorreta.", "Voce tem 2 lote(s) de creditos ativos..."). O `api-client` da
 * precedencia ao texto autoral do servidor, entao aquela string chegava
 * identica aos quatro publicos do app — inclusive para quem le em en-US, es-ES
 * ou it-IT. Aqui o servidor manda `error: null` + `code`, e o dono da copy
 * (`src/lib/errors/copy.ts`) traduz no locale ativo do leitor.
 *
 * O unico dado que copy generica nao reproduz — quantos lotes de credito ainda
 * estao ativos — viaja em `details.batches`, numero, sem idioma.
 */
function errorResponse(
  code: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    { ...apiResponse(null), code, ...(details ? { details } : {}) },
    { status },
  );
}

/** POST /api/v1/auth/delete-account */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    // AUTH_002 (sessao expirada), nao AUTH_001: aqui nao houve senha errada, e
    // o cliente precisa distinguir os dois para nao expulsar da conta quem so
    // digitou a senha errada.
    return errorResponse('AUTH_002', 401);
  }

  try {
    const body = await request.json();
    const parsed = DeleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('VAL_001', 400);
    }

    await authService.deleteAccount(userId, parsed.data);
    const response = NextResponse.json(
      apiResponse(null, null, 'Conta marcada para exclusão. Você receberá um email de confirmação.'),
    );
    clearAuthCookie(response);
    return response;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      return errorResponse('AUTH_001', 401);
    }
    if (err instanceof Error && err.message === 'ACTIVE_CREDITS') {
      const credits = (err as Error & { credits?: unknown[] }).credits ?? [];
      return errorResponse('ACTIVE_CREDITS', 409, { batches: credits.length });
    }
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
