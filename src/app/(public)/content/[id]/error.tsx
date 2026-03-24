'use client';
import { ROUTES } from '@/lib/constants/routes';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

export default function ContentDetailError({
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
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h2 className="text-lg font-semibold text-foreground">Erro ao carregar conteúdo</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        Não foi possível carregar este conteúdo. Tente novamente ou explore outros materiais.
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        <Button onClick={reset}>Tentar novamente</Button>
        <Button variant="outline" asChild>
          <Link href={ROUTES.CONTENT}>Ver todos os conteúdos</Link>
        </Button>
      </div>
    </div>
  );
}
