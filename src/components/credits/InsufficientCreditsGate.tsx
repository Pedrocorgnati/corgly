import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CreditCard } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

interface InsufficientCreditsGateProps {
  balance: number;
  children?: React.ReactNode;
}

export function InsufficientCreditsGate({ balance, children }: InsufficientCreditsGateProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo aluno. Server Component sincrono: `useTranslations` vale aqui.
  const t = useTranslations('credits.gate');

  if (balance > 0) {
    return <>{children}</>;
  }

  return (
    <section
      data-testid="insufficient-credits-gate"
      className="rounded-lg border border-destructive/30 bg-destructive/10 p-4"
      role="status"
      aria-labelledby="insufficient-credits-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="insufficient-credits-title" className="text-sm font-semibold text-foreground">
              {t('title')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('description')}
            </p>
          </div>
        </div>

        <Link
          data-testid="insufficient-credits-buy-link"
          href={ROUTES.CREDITS}
          className={cn(buttonVariants(), 'min-h-[44px] shrink-0')}
        >
          <CreditCard className="h-4 w-4" aria-hidden="true" />
          {t('cta')}
        </Link>
      </div>
    </section>
  );
}
