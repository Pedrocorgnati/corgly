/**
 * Sentry — Client runtime (browser).
 *
 * Ativado apenas quando NEXT_PUBLIC_SENTRY_DSN esta setado.
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
      // Em producao capturamos replays apenas em erros.
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0,
    });
  } catch {
    // @sentry/nextjs nao instalado — ver PENDING-ACTIONS.md
  }
}
