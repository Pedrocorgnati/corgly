'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { logger } from '@/lib/logger';

/**
 * Fronteira de erro desta rota.
 *
 * A copy sai de `errors.serverError.*` — o mesmo namespace da fronteira raiz —
 * porque estava fixa em portugues numa plataforma que atende quatro idiomas.
 * Titulo generico e deliberado: melhor texto certo no idioma do leitor do que
 * titulo especifico que 3 dos 4 publicos nao entendem.
 */
export default function AdminStudentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations('errors');

  useEffect(() => {
    logger.error('Route error boundary triggered', { route: pathname, digest: error.digest }, error);
  }, [error, pathname]);

  return (
    <div data-testid="admin-students-error" className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto">
      <div className="bg-card border border-border rounded-2xl p-8 shadow-sm text-center">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">{t('serverError.title')}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t('serverError.description')}
        </p>
        <button
          data-testid="admin-students-error-retry-button"
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {t('serverError.retry')}
        </button>
      </div>
    </div>
  );
}
