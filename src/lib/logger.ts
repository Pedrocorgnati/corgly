/**
 * Logger centralizado — Corgly
 *
 * Producao: JSON estruturado por linha `{ts, level, msg, correlationId, userId?, route?, ...}`.
 * Desenvolvimento: JSON tambem, para paridade com producao (CL-293).
 *
 * correlationId e resolvido automaticamente via AsyncLocalStorage (request-context),
 * setado no middleware. Pode ser sobrescrito passando `correlationId` no context.
 *
 * Uso:
 *   import { logger } from '@/lib/logger';
 *   logger.error('mensagem', { route, userId, action }, err);
 *   logger.warn('mensagem', { action });
 *   logger.info('mensagem', { userId });
 */

/**
 * O logger e isomorfico: os error boundaries (client components) tambem o usam.
 * `request-context` depende de node:async_hooks e nao pode entrar no bundle do
 * browser, entao o contexto por request e INJETADO pelo servidor via
 * `setRequestContextResolver` em vez de importado aqui. No browser o resolver
 * default devolve {} e o log sai sem correlationId.
 */
type RequestContextSnapshot = {
  correlationId?: string;
  userId?: string;
  route?: string;
};

let resolveRequestContext: () => RequestContextSnapshot = () => ({});

export function setRequestContextResolver(
  resolver: () => RequestContextSnapshot,
): void {
  resolveRequestContext = resolver;
}

type LogContext = {
  route?: string;
  userId?: string;
  digest?: string;
  action?: string;
  correlationId?: string;
  [key: string]: unknown;
};

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const SERVICE = 'corgly';
const isDev = process.env.NODE_ENV === 'development';

function formatStructured(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown,
): string {
  const reqCtx = resolveRequestContext();
  const base: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    service: SERVICE,
    correlationId: context?.correlationId ?? reqCtx.correlationId,
    userId: context?.userId ?? reqCtx.userId,
    route: context?.route ?? reqCtx.route,
  };
  if (context) {
    for (const [k, v] of Object.entries(context)) {
      if (k === 'correlationId' || k === 'userId' || k === 'route') continue;
      base[k] = v;
    }
  }
  if (error !== undefined) {
    if (error instanceof Error) {
      base.error = { name: error.name, message: error.message, stack: error.stack };
    } else {
      base.error = String(error);
    }
  }
  // Remover chaves undefined para linhas JSON mais limpas
  for (const k of Object.keys(base)) {
    if (base[k] === undefined) delete base[k];
  }
  return JSON.stringify(base);
}

export const logger = {
  error(message: string, context?: LogContext, error?: unknown): void {
    // eslint-disable-next-line no-console
    console.error(formatStructured('error', message, context, error));
  },

  warn(message: string, context?: LogContext): void {
    // eslint-disable-next-line no-console
    console.warn(formatStructured('warn', message, context));
  },

  info(message: string, context?: LogContext): void {
    // Em producao, info continua ativo para observabilidade (Datadog/Logtail).
    // eslint-disable-next-line no-console
    console.info(formatStructured('info', message, context));
  },

  debug(message: string, context?: LogContext): void {
    if (!isDev) return;
    // eslint-disable-next-line no-console
    console.debug(formatStructured('debug', message, context));
  },
};
