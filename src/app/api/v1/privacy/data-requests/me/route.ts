import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { listOwnDataRequests } from '@/lib/privacy/data-export.service';

/**
 * GET /api/v1/privacy/data-requests/me  (T-042 / X-19 / ST-52)
 *
 * Consulta dos Data Subject Requests do TITULAR AUTENTICADO. Permite que o
 * usuário acompanhe o status dos próprios pedidos (Acceptance T-042) e descubra
 * quando um arquivo de export está pronto para download.
 *
 * Escopo estrito ao `userId` da sessão: pedidos anônimos abertos com o mesmo
 * e-mail NÃO aparecem aqui (são consultados por código de referência via rota
 * pública). Isso evita correlacionar atividade anônima a uma conta sem prova.
 *
 * Resposta sanitizada: nunca expõe `signedArchiveUrl`, hashes de verificação de
 * e-mail nem metadados internos, apenas estado derivado e o caminho de download
 * quando aplicável.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const limit = await checkRateLimit(`dsr:me:${auth.id}`, RATE_LIMITS.GENERAL);
  if (!limit.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas solicitações. Tente novamente em alguns instantes.'),
      { status: 429 },
    );
  }

  try {
    const requests = await listOwnDataRequests(auth.id);

    logger.info('privacy.data_request.list_own', {
      userId: auth.id,
      action: 'data_request_list_own',
    });

    return NextResponse.json(apiResponse({ requests, total: requests.length }));
  } catch (err) {
    logger.error(
      'GET /api/v1/privacy/data-requests/me',
      { userId: auth.id, action: 'data_request_list_own' },
      err,
    );
    return NextResponse.json(
      apiResponse(null, 'Erro ao consultar seus pedidos. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
