'use client';

import { useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { STORAGE_KEYS } from '@/lib/constants';
import { PriceDisplay } from '@/components/billing/PriceDisplay';
import { useUserCurrency } from '@/lib/hooks/use-user-currency';
import { resolvePrice } from '@/lib/pricing/config';

interface DiscountBannerProps {
  visible: boolean;
}

/**
 * Store de dispensa espelhando o sessionStorage.
 *
 * `sessionStorage` NAO pode ser lido durante o render (o servidor renderiza o
 * banner visivel e o cliente leria "dispensado", quebrando a hidratacao) nem
 * dentro de um efeito com setState (cascata de render). `useSyncExternalStore`
 * resolve os dois: o snapshot de servidor/hidratacao e sempre "visivel" e o
 * valor real entra logo apos a hidratacao.
 */
const listeners = new Set<() => void>();
let dismissedSnapshot: boolean | null = null;

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.SESSION.DISCOUNT_DISMISSED) === 'true';
  } catch {
    // storage bloqueado — banner segue visivel nesta sessao
    return false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot memorizado: `useSyncExternalStore` exige identidade estavel entre renders. */
function getSnapshot(): boolean {
  if (dismissedSnapshot === null) {
    dismissedSnapshot = readDismissed();
  }
  return dismissedSnapshot;
}

function getServerSnapshot(): boolean {
  return false;
}

function dismissBanner(): void {
  try {
    sessionStorage.setItem(STORAGE_KEYS.SESSION.DISCOUNT_DISMISSED, 'true');
  } catch {
    // storage bloqueado — a dispensa vale apenas enquanto esta pagina estiver aberta
  }
  dismissedSnapshot = true;
  for (const listener of listeners) listener();
}

/**
 * Banner da promocao de primeira aula.
 *
 * Preco e percentual saem da MESMA fonte usada pelo checkout (`resolvePrice`
 * -> PROMO e SINGLE). Nao ha multiplicacao local de desconto nem simbolo de
 * moeda fixo: a moeda ativa e a mesma da vitrine (store compartilhado do
 * `useUserCurrency`) e a formatacao vai por `PriceDisplay`.
 */
export function DiscountBanner({ visible }: DiscountBannerProps) {
  const t = useTranslations('credits.discount');
  const locale = useLocale();
  const { currency } = useUserCurrency();
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!visible || dismissed) return null;

  const promoCents = resolvePrice('PROMO', currency).amountCents;
  const singleCents = resolvePrice('SINGLE', currency).amountCents;
  // Percentual derivado dos precos de tabela — nunca de constante paralela.
  const discountPercent = Math.round((1 - promoCents / singleCents) * 100);

  return (
    <div
      data-testid="discount-banner"
      role="alert"
      aria-label={t('title')}
      className="mb-6 flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border border-amber-200 dark:border-amber-800 rounded-xl"
    >
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">&#x26A1;</span>
        <div>
          <p className="font-semibold text-amber-800 dark:text-amber-200 text-sm flex flex-wrap items-baseline gap-1">
            <span>{t('message', { discount: discountPercent })}</span>
            <span aria-hidden="true">&mdash;</span>
            <span data-testid="discount-banner-price">
              <PriceDisplay
                amountCents={promoCents}
                currency={currency}
                locale={locale}
                className="font-bold"
              />
            </span>
          </p>
        </div>
      </div>
      <button
        data-testid="discount-banner-dismiss-button"
        onClick={dismissBanner}
        className="text-amber-500 hover:text-amber-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label={t('dismiss')}
      >
        &#x2715;
      </button>
    </div>
  );
}
