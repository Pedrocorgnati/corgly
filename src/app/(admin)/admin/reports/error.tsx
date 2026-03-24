'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { logger } from '@/lib/logger';

export default function AdminReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    logger.error('Route error boundary triggered', { route: pathname, digest: error.digest }, error);
  }, [error, pathname]);

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto">
      <div className="bg-card border border-border rounded-2xl p-8 shadow-sm text-center">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Erro ao carregar relatórios</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Ocorreu um erro inesperado. Tente novamente.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
