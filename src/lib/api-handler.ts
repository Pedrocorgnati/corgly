import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { runWithContext } from '@/lib/request-context';
import { logger } from '@/lib/logger';
import { apiResponse } from '@/lib/auth';

export type RouteHandler<Ctx = unknown> = (
  request: NextRequest,
  context: Ctx,
) => Promise<NextResponse> | NextResponse;

/**
 * Higher-order wrapper para route handlers do App Router.
 *
 * - Extrai correlationId do header `x-request-id` (setado pelo proxy, src/proxy.ts).
 * - Executa o handler dentro de `runWithContext({correlationId, route})` para
 *   que `logger` resolva o contexto via AsyncLocalStorage sem prop drilling.
 * - Loga inicio, sucesso (com latencia e status) e erros com stack.
 * - Em erro nao tratado, devolve 500 padronizado com header `x-request-id`.
 */
export function withApiHandler<Ctx = unknown>(
  handler: RouteHandler<Ctx>,
): RouteHandler<Ctx> {
  return async (request, context) => {
    const correlationId =
      request.headers.get('x-request-id') ?? cryptoRandomId();
    const route = new URL(request.url).pathname;
    const method = request.method;
    const userId = request.headers.get('x-user-id') ?? undefined;
    const started = Date.now();

    return runWithContext({ correlationId, userId, route }, async () => {
      logger.info('api.request.start', { action: 'api_request', method });

      try {
        const res = await handler(request, context);
        const latencyMs = Date.now() - started;
        const status = res.status;
        // Garante que correlationId volta na resposta mesmo em handlers
        // que nao tenham setado o header por conta propria.
        if (!res.headers.get('x-request-id')) {
          res.headers.set('x-request-id', correlationId);
        }
        logger.info('api.request.end', {
          action: 'api_response',
          method,
          status,
          latencyMs,
        });
        return res;
      } catch (err) {
        const latencyMs = Date.now() - started;
        logger.error(
          'api.request.error',
          { action: 'api_error', method, latencyMs },
          err,
        );
        const res = NextResponse.json(
          apiResponse(null, 'Erro interno. Tente novamente em instantes.'),
          { status: 500 },
        );
        res.headers.set('x-request-id', correlationId);
        return res;
      }
    });
  };
}

function cryptoRandomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
