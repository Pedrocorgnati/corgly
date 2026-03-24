/**
 * Logger centralizado — Corgly
 *
 * Desenvolvimento: mensagens legíveis com prefixo.
 * Produção: JSON estruturado para agregação (Datadog, Logtail, etc.).
 *
 * Uso:
 *   import { logger } from '@/lib/logger';
 *   logger.error('mensagem', { route, userId, action }, err);
 *   logger.warn('mensagem', { action });
 *   logger.info('mensagem', { userId }); // no-op em produção
 */

type LogContext = {
  route?: string;
  userId?: string;
  digest?: string;
  action?: string;
  [key: string]: unknown;
};

const isDev = process.env.NODE_ENV === 'development';

function formatDev(level: string, message: string, context?: LogContext): string {
  const parts = [`[${level.toUpperCase()}]`, message];
  if (context?.route) parts.push(`route=${context.route}`);
  if (context?.action) parts.push(`action=${context.action}`);
  if (context?.digest) parts.push(`digest=${context.digest}`);
  if (context?.userId) parts.push(`userId=${context.userId}`);
  return parts.join(' | ');
}

function formatProd(
  level: string,
  message: string,
  context?: LogContext,
  error?: unknown,
): string {
  return JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    service: 'corgly',
    ...context,
    ...(error !== undefined
      ? { error: error instanceof Error ? error.message : String(error) }
      : {}),
  });
}

export const logger = {
  error(message: string, context?: LogContext, error?: unknown): void {
    if (isDev) {
      console.error(formatDev('error', message, context), error ?? '');
      return;
    }

    // Produção: integrar Sentry quando configurado
    if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
      // Sentry.captureException(error ?? new Error(message), { extra: context });
      // Descomente e instale @sentry/nextjs quando pronto
    }

    console.error(formatProd('error', message, context, error));
  },

  warn(message: string, context?: LogContext): void {
    if (isDev) {
      console.warn(formatDev('warn', message, context), context ?? '');
      return;
    }
    console.warn(formatProd('warn', message, context));
  },

  info(message: string, context?: LogContext): void {
    if (!isDev) return; // logs de info apenas em desenvolvimento
    console.info(formatDev('info', message, context), context ?? '');
  },
};
