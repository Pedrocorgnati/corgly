'use client';

/**
 * Error boundary da tentativa de exercicio.
 *
 * Cai aqui quando `getPlayableForStudent` falha por motivo nao tratado pela
 * pagina (banco fora, drift de contrato) ou quando o render do segmento falha.
 *
 * Next 16.2: o retry canonico e `unstable_retry()`, que refaz o fetch e o
 * render do conteudo do boundary. `reset()` continua sendo passado, mas so
 * limpa o estado de erro sem refazer o trabalho. Mesmo contrato do `error.tsx`
 * irmao em `(student)/exercises/error.tsx`.
 * Fonte: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
 * (secoes `unstable_retry` e `reset`).
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

interface ExerciseAttemptErrorProps {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function ExerciseAttemptError({ error, unstable_retry }: ExerciseAttemptErrorProps) {
  const t = useTranslations('exercises');
  const pathname = usePathname();

  useEffect(() => {
    logger.error('Route error boundary triggered', { route: pathname, digest: error.digest }, error);
  }, [error, pathname]);

  return (
    <div
      data-testid="exercise-attempt-error"
      className="flex min-h-dvh items-center justify-center bg-background p-8"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" aria-hidden="true" />
        <h2 className="mb-2 text-lg font-semibold text-foreground">{t('errorTitle')}</h2>
        <p className="mb-6 text-sm text-muted-foreground">{t('errorDescription')}</p>
        <Button
          data-testid="exercise-attempt-error-retry-button"
          size="lg"
          onClick={() => unstable_retry()}
        >
          {t('errorRetry')}
        </Button>
      </div>
    </div>
  );
}
