'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Integrar Sentry aqui quando NEXT_PUBLIC_SENTRY_DSN estiver configurado
    console.error('[global-error]', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#09090b', color: '#fafafa' }}>
        <div
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
