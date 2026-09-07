'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

/**
 * Fronteira de erro da rota `/credits`.
 *
 * A copy sai do catalogo (`errors.serverError.*`, o mesmo namespace que a
 * fronteira raiz `src/app/error.tsx` usa) porque estava fixa em portugues numa
 * plataforma que atende quatro idiomas: o aluno italiano que caisse aqui lia
 * "Erro ao carregar creditos" sem entender o botao.
 */
export default function StudentCreditsError({
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
    <div data-testid="credits-error" className="px-4 py-6 md:px-6 md:py-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h2 className="text-lg font-semibold text-foreground">{t('serverError.title')}</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        {t('serverError.description')}
      </p>
      <Button data-testid="credits-error-retry-button" onClick={reset}>
        {t('serverError.retry')}
      </Button>
    </div>
  );
}
