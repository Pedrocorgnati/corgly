'use client';
import { ROUTES } from '@/lib/constants/routes';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

export default function SessionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    logger.error('Session error boundary triggered', { route: pathname, digest: error.digest }, error);
  }, [error, pathname]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Erro na sessão</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Ocorreu um erro inesperado durante a sessão. Tente reconectar ou volte ao dashboard.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset}>Tentar reconectar</Button>
          <Button variant="outline" asChild>
            <Link href={ROUTES.DASHBOARD}>Voltar ao dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
