'use client';
import { ROUTES } from '@/lib/constants/routes';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { logger } from '@/lib/logger';
import { PageWrapper } from '@/components/shared';

export default function AdminFeedbackSessionError({
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
    <PageWrapper>
      <div className="bg-card border border-border rounded-2xl p-8 shadow-sm text-center">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Erro ao carregar feedback da sessão</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Não foi possível carregar os dados desta sessão. Tente novamente.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Tentar novamente
          </button>
          <Link
            href={ROUTES.ADMIN_SESSIONS}
            className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
          >
            Ver todas as sessões
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}
