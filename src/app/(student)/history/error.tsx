'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('history');
  const pathname = usePathname();

  useEffect(() => {
    logger.error('Route error boundary triggered', { route: pathname, digest: error.digest }, error);
  }, [error, pathname]);

  return (
    <div data-testid="history-error" className="px-4 py-6 md:px-6 md:py-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <h2 className="text-lg font-semibold text-foreground">{t('errorTitle')}</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        {t('errorDescription')}
      </p>
      <Button data-testid="history-error-retry-button" onClick={reset}>{t('errorRetry')}</Button>
    </div>
  );
}
