'use client';
import { ROUTES } from '@/lib/constants/routes';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
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
export default function ContentDetailError({
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
    <div data-testid="content-detail-error" className="px-4 py-6 md:px-6 md:py-8 max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h2 className="text-lg font-semibold text-foreground">{t('serverError.title')}</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        {t('serverError.description')}
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        <Button data-testid="content-detail-error-retry-button" onClick={reset}>{t('serverError.retry')}</Button>
        <Button variant="outline" asChild>
          <Link data-testid="content-detail-error-all-link" href={ROUTES.CONTENT}>{t('serverError.backToContent')}</Link>
        </Button>
      </div>
    </div>
  );
}
