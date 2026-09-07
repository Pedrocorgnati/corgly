'use client';

import { useRouter } from 'next/navigation';
import { AlertCircle, Coins } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Saldo de creditos exibido no topo da vitrine de planos.
 *
 * POR QUE ELE EXISTE: a pagina de creditos vendia pacote sem nunca dizer quanto
 * o aluno ja tem. Quem chegava aqui para "comprar mais" nao tinha como saber se
 * precisava comprar — e o unico lugar que mostrava o numero era o widget do
 * dashboard, uma tela atras.
 *
 * O numero vem de `creditService.getBalance` (ver `page.tsx`), o MESMO predicado
 * que a consulta FEFO usa para autorizar agendamento
 * (`usedCredits < totalCredits AND (expiresAt > NOW() OR expiresAt IS NULL)`).
 * Saldo exibido e saldo cobravel nao podem divergir.
 *
 * TRES estados distintos e visiveis (o loading e da rota, em `loading.tsx`):
 *  - sucesso: o numero;
 *  - vazio: o numero zero MAIS a explicacao de que nao da para agendar sem
 *    credito (era uma rota propria orfa, `/credits/empty`, sem link nenhum
 *    apontando para ela);
 *  - erro: aviso explicito e botao que refaz a busca no servidor, em vez de
 *    exibir zero e fazer o aluno acreditar que perdeu os creditos.
 */
export type CreditBalanceState = { status: 'ok'; balance: number } | { status: 'error' };

export interface CreditBalanceSummaryProps {
  state: CreditBalanceState;
}

export function CreditBalanceSummary({ state }: CreditBalanceSummaryProps) {
  const router = useRouter();
  const t = useTranslations('credits.breakdown');
  const tEmpty = useTranslations('emptyState.credits');
  const tError = useTranslations('errorState');

  if (state.status === 'error') {
    return (
      <section
        data-testid="credits-balance"
        data-state="error"
        role="alert"
        className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" aria-hidden="true" />
          <p data-testid="credits-balance-error" className="text-sm text-foreground">
            {tError('defaultMessage')}
          </p>
          <Button
            data-testid="credits-balance-retry-button"
            variant="outline"
            className="ml-auto h-11 min-h-[44px] px-4"
            onClick={() => router.refresh()}
          >
            {tError('retry')}
          </Button>
        </div>
      </section>
    );
  }

  const isEmpty = state.balance === 0;

  return (
    <section
      data-testid="credits-balance"
      data-state={isEmpty ? 'empty' : 'ok'}
      className={cn(
        'mb-6 rounded-2xl border bg-card px-5 py-4',
        isEmpty ? 'border-destructive/40' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Coins
          className={cn('h-5 w-5 flex-shrink-0', isEmpty ? 'text-destructive' : 'text-primary')}
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">{t('balance')}</p>
        <p
          data-testid="credits-balance-value"
          className={cn(
            'text-2xl font-bold leading-none tracking-tight',
            isEmpty ? 'text-destructive' : 'text-foreground',
          )}
        >
          {state.balance}
        </p>
      </div>

      {isEmpty && (
        <div data-testid="credits-balance-empty" className="mt-3">
          <p className="text-sm font-semibold text-foreground">{tEmpty('title')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{tEmpty('description')}</p>
        </div>
      )}
    </section>
  );
}
