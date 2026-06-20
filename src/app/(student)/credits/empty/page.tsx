import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, CreditCard, History } from 'lucide-react';
import { PageWrapper } from '@/components/shared';
import { buttonVariants } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Sem créditos',
};

export default function EmptyCreditsPage() {
  return (
    <PageWrapper className="max-w-3xl">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CreditCard className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-foreground">Você está sem créditos</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Compre créditos para liberar novos agendamentos. Suas aulas já marcadas continuam no histórico.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link
                href={ROUTES.CREDITS}
                className={cn(buttonVariants(), 'min-h-[44px] w-full')}
              >
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                Comprar créditos
              </Link>
              <Link
                href={ROUTES.SCHEDULE}
                className={cn(buttonVariants({ variant: 'outline' }), 'min-h-[44px] w-full')}
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Ver agenda
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-background p-4">
        <div className="flex gap-3">
          <History className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Acompanhe suas aulas</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Depois de comprar créditos, volte para a agenda e confirme um horário disponível.
            </p>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
