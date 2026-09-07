'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants/routes';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Fronteira de erro GLOBAL: substitui o root layout inteiro, inclusive o
 * `NextIntlClientProvider` que mora nele. Por isso — e so por isso — a copy
 * aqui continua fixa; `useTranslations` lancaria "No intl context found"
 * exatamente na tela que existe para nao quebrar. As fronteiras por rota
 * (`src/app/**\/error.tsx`) renderizam DENTRO do provider e usam
 * `errors.serverError.*`.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Log estruturado local para captura em containers/PM2.
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'global_error',
        digest: error.digest,
        message: error.message,
        stack: error.stack,
      }),
    );
    // Sentry: capturado apenas quando NEXT_PUBLIC_SENTRY_DSN + pacote instalado.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      try {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const Sentry = require('@sentry/nextjs');
        Sentry.captureException(error, { tags: { digest: error.digest } });
      } catch {
        // pacote nao instalado — ver PENDING-ACTIONS.md
      }
    }
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#09090b', color: '#fafafa' }}>
        <div
          data-testid="app-global-error"
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '24rem' }}>
            <p style={{ fontSize: '3rem', fontWeight: 700, color: '#ef4444', marginBottom: '1rem' }}>!</p>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Algo deu errado
            </h1>
            <p style={{ color: '#a1a1aa', marginBottom: '2rem', fontSize: '0.875rem' }}>
              Ocorreu um erro inesperado na aplicação. Tente novamente ou recarregue a página.
            </p>
            {error.digest && (
              <p style={{ color: '#52525b', fontSize: '0.75rem', marginBottom: '1rem' }}>
                Código: {error.digest}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                data-testid="app-global-error-retry-button"
                onClick={reset}
                style={{
                  padding: '0.5rem 1.5rem',
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                Tentar novamente
              </button>
              <Link
                data-testid="app-global-error-home-link"
                href={ROUTES.HOME}
                style={{
                  padding: '0.5rem 1.5rem',
                  background: 'transparent',
                  color: '#a1a1aa',
                  border: '1px solid #27272a',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                Ir para o início
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
