'use client';
import { ROUTES } from '@/lib/constants/routes';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

/**
 * Fronteira de erro desta rota.
 *
 * A copy sai de `errors.serverError.*` — o mesmo namespace da fronteira raiz —
 * porque estava fixa em portugues numa plataforma que atende quatro idiomas.
 * Titulo generico e deliberado: melhor texto certo no idioma do leitor do que
 * titulo especifico que 3 dos 4 publicos nao entendem.
 */
export default function SessionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations('errors');

  useEffect(() => {
    logger.error('Session error boundary triggered', { route: pathname, digest: error.digest }, error);
  }, [error, pathname]);

  return (
    <div data-testid="session-error" className="min-h-dvh flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">{t('serverError.title')}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t('serverError.description')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button data-testid="session-error-retry-button" onClick={reset}>{t('serverError.reconnect')}</Button>
          <Button variant="outline" asChild>
            <Link data-testid="session-error-dashboard-link" href={ROUTES.DASHBOARD}>{t('serverError.goDashboard')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
