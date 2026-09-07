'use client';
import { ROUTES } from '@/lib/constants/routes';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { logger } from '@/lib/logger';
import { PageWrapper } from '@/components/shared';

/**
 * Fronteira de erro desta rota.
 *
 * A copy sai de `errors.serverError.*` — o mesmo namespace da fronteira raiz —
 * porque estava fixa em portugues numa plataforma que atende quatro idiomas.
 * Titulo generico e deliberado: melhor texto certo no idioma do leitor do que
 * titulo especifico que 3 dos 4 publicos nao entendem.
 */
export default function AdminFeedbackSessionError({
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
    <PageWrapper>
      <div data-testid="admin-feedback-error" className="bg-card border border-border rounded-2xl p-8 shadow-sm text-center">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">{t('serverError.title')}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t('serverError.description')}
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            data-testid="admin-feedback-error-retry-button"
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {t('serverError.retry')}
          </button>
          <Link
            data-testid="admin-feedback-error-all-link"
            href={ROUTES.ADMIN_SESSIONS}
            className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
          >
            {t('serverError.backToSessions')}
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}
