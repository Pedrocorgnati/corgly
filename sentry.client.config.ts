/**
 * Sentry — Client runtime (browser).
 *
 * Ativado apenas quando NEXT_PUBLIC_SENTRY_DSN esta setado.
 */
import { sanitizeSentryEvent } from '@/lib/observability/sentry-sanitize';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const Sentry = require('@sentry/nextjs');
    Sentry.init({
      dsn,
      // GAP-12: nenhum token/segredo chega ao Sentry (beforeSend sanitiza)
      beforeSend: (event: Record<string, unknown>) => sanitizeSentryEvent(event),
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

// Marcador de MODULO. Sem nenhum `import`/`export`, o TypeScript trata este
// arquivo como script global: os tres `sentry.*.config.ts` passam a dividir o
// mesmo escopo e o `const dsn` de cada um colide com o dos outros (TS2451,
// que reprovava o type-check do `next build`). O `export {}` isola o escopo
// sem alterar o efeito colateral de inicializacao no import.
export {};
