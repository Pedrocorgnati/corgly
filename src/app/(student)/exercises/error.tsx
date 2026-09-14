'use client';

/**
 * Error boundary do segmento de exercicios.
 *
 * Cai aqui quando a leitura de sessao/banco falha ou quando o render do
 * segmento encontra qualquer outro erro inesperado.
 *
 * Next 16.2: o retry canonico e `unstable_retry()`, que refaz o fetch e o
 * render do conteudo do boundary. `reset()` continua sendo passado, mas so
 * limpa o estado de erro sem refazer o trabalho; como a rota consulta o banco,
 * refazer o render e o retry que pode recuperar uma falha transitoria.
 * Fonte: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
 * (secoes `unstable_retry` e `reset`). Os boundaries irmaos em (student) ainda
 * usam `reset` porque sao anteriores a 16.2.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

interface ExercisesErrorProps {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function ExercisesError({ error, unstable_retry }: ExercisesErrorProps) {
  const t = useTranslations('exercises');
  const pathname = usePathname();

  useEffect(() => {
    logger.error('Route error boundary triggered', { route: pathname, digest: error.digest }, error);
  }, [error, pathname]);

  return (
    <div
      data-testid="exercises-error"
      className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8"
    >
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" aria-hidden="true" />
        <h2 className="mb-2 text-lg font-semibold text-foreground">{t('errorTitle')}</h2>
        <p className="mb-6 text-sm text-muted-foreground">{t('errorDescription')}</p>
        <Button
          data-testid="exercises-error-retry-button"
          size="lg"
          className="min-h-11 min-w-11"
          onClick={() => unstable_retry()}
        >
          {t('errorRetry')}
        </Button>
      </div>
    </div>
  );
}
