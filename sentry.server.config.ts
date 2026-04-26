/**
 * Sentry — Server runtime (Node.js).
 *
 * Ativado apenas quando NEXT_PUBLIC_SENTRY_DSN esta setado. Pacote
 * @sentry/nextjs e carregado via require() com try/catch para permitir
 * que o projeto funcione mesmo antes do `npm i @sentry/nextjs`.
 *
 * Variaveis relacionadas: NEXT_PUBLIC_SENTRY_DSN, SENTRY_ENVIRONMENT.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const Sentry = require('@sentry/nextjs');
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      // Reduz payload: sem enviar body do request por padrao
      sendDefaultPii: false,
    });
  } catch {
    // @sentry/nextjs nao instalado — ver output/workspace/corgly/PENDING-ACTIONS.md
  }
}
