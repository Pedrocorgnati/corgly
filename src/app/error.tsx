'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  const t = useTranslations('errors');
  const pathname = usePathname();

  useEffect(() => {
    logger.error('Root error boundary triggered', { route: pathname, digest: error.digest }, error);
  }, [error, pathname]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 bg-background">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10 mb-4">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">{t('serverError.title')}</h1>
        <p className="text-muted-foreground mb-8">
          {t('serverError.description')}
        </p>
        <Button onClick={reset} className="w-full">
          {t('serverError.retry')}
        </Button>
      </div>
    </div>
  );
}
