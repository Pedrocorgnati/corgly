'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui/error-state';
import { logger } from '@/lib/logger';

/**
 * Fronteira de erro da rota, no desenho de `admin/content/error.tsx`: copy de
 * `errors.serverError.*` (quatro idiomas) e log com digest. O retry usa o
 * `ErrorState` do kit — nada de div solta.
 */
export default function AdminExercisesError({
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
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto">
      <div className="bg-card border border-border rounded-2xl shadow-sm">
        <ErrorState
          data-testid="admin-exercises-error"
          title={t('serverError.title')}
          message={t('serverError.description')}
          onRetry={reset}
        />
      </div>
    </div>
  );
}
