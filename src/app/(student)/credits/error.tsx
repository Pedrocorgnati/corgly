'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

export default function StudentCreditsError({
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
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h2 className="text-lg font-semibold text-foreground">Erro ao carregar créditos</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        Não foi possível carregar suas informações de créditos. Tente novamente.
      </p>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
