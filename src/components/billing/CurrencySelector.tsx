'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { missingMessage } from '@/lib/i18n/message-fallback';
import { SUPPORTED_CURRENCIES, type Currency } from '@/lib/currency';
import type { CurrencyErrorKind } from '@/lib/hooks/use-user-currency';

const CURRENCY_LABELS: Record<Currency, string> = {
  USD: 'USD $',
  BRL: 'BRL R$',
  EUR: 'EUR €',
  USDC: 'USDC',
};

interface CurrencySelectorProps {
  /** Moeda selecionada. Componente CONTROLADO: quem manda e o dono do estado. */
  value: Currency;
  /** Chamado com a nova moeda. A persistencia e responsabilidade do dono. */
  onChange: (currency: Currency) => void;
  /** Moedas disponiveis para selecao. Default: todas as suportadas. */
  available?: readonly Currency[];
  className?: string;
  /** Preferencia ainda carregando (GET em voo). */
  isLoading?: boolean;
  /** Persistencia em voo (PATCH). */
  isSaving?: boolean;
  /** Falha de carga ou de gravacao, para mensagem traduzida + retry. */
  error?: CurrencyErrorKind | null;
  /** Acao do botao "tentar novamente" quando `error` esta presente. */
  onRetry?: () => void;
  /** Testid do grupo. Os botoes derivam `${testId}-${moeda}-button`. */
  'data-testid'?: string;
}

/**
 * Seletor de moeda de exibicao/cobranca (ADR-0006 §2).
 *
 * - Apresentacional e controlado: nao le nem grava preferencia por conta
 *   propria. Isso evita a gravacao dupla que existia quando o componente
 *   chamava o PATCH sozinho alem do hook.
 * - Nenhuma promessa de que a cobranca sera feita nessa moeda (Zero Assumido):
 *   o componente nao renderiza preco nenhum. O aviso de rodape que repetia isso
 *   em texto ("a moeda cobrada e confirmada no checkout / USDC sujeito ao
 *   gateway") saiu em 2026-09-07: era ruido fixo abaixo do seletor, sem acao
 *   possivel para quem le.
 */
export function CurrencySelector({
  value,
  onChange,
  available = SUPPORTED_CURRENCIES,
  className,
  isLoading = false,
  isSaving = false,
  error = null,
  onRetry,
  'data-testid': testId = 'currency-selector',
}: CurrencySelectorProps) {
  const t = useTranslations('credits.currency');
  const text = (key: string, values?: Record<string, string | number>): string =>
    t.has(key) ? t(key, values) : missingMessage(`credits.currency.${key}`, 'CurrencySelector');

  const busy = isLoading || isSaving;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{text('label')}</span>
        <div
          data-testid={testId}
          role="group"
          aria-label={text('groupAria')}
          aria-busy={busy}
          className="flex flex-wrap gap-2"
        >
          {available.map((currency) => {
            const isSelected = currency === value;
            return (
              <button
                key={currency}
                data-testid={`${testId}-${currency.toLowerCase()}-button`}
                type="button"
                onClick={() => {
                  if (currency !== value) onChange(currency);
                }}
                disabled={busy}
                aria-pressed={isSelected}
                aria-label={text('optionAria', { currency })}
                className={cn(
                  'inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:pointer-events-none disabled:opacity-50',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-muted',
                )}
              >
                {CURRENCY_LABELS[currency]}
              </button>
            );
          })}
        </div>
        {/*
          Indicador de "em voo" SEM reflow.

          Ate 2026-09-07 este bloco injetava a frase inteira ("Salvando sua
          preferencia de moeda...", ~264px) na MESMA linha flex dos botoes
          durante o PATCH e a removia ao terminar: por um instante o rotulo e as
          quatro moedas eram empurrados para fora da tela e voltavam. Agora o
          espaco do spinner e RESERVADO o tempo todo (largura fixa, sempre
          montado), entao nada se move quando a gravacao comeca ou acaba.

          Zero Silencio continua valendo: a frase segue no DOM, em `sr-only`,
          dentro de um `role="status"` que o leitor de tela anuncia.
        */}
        <span
          data-slot="currency-selector-busy-slot"
          aria-hidden="true"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </span>
        {busy && (
          <span data-testid={`${testId}-status`} role="status" className="sr-only">
            {isSaving ? text('saving') : text('loading')}
          </span>
        )}
      </div>

      {error && (
        <p
          data-testid={`${testId}-error`}
          role="alert"
          className="flex flex-wrap items-center gap-2 text-xs text-destructive"
        >
          {error === 'load' ? text('loadError', { currency: value }) : text('saveError')}
          {onRetry && (
            <button
              data-testid={`${testId}-retry-button`}
              type="button"
              onClick={onRetry}
              className="underline underline-offset-2 hover:no-underline"
            >
              {text('retry')}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
