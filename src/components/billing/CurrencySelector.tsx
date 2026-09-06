'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
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
 * Traducao obrigatoria: chave ausente e DEFEITO, nao texto opcional.
 * Em desenvolvimento estoura no primeiro render; em producao devolve string
 * vazia — a chave crua NUNCA aparece para o usuario final.
 *
 * DUPLICADO em `src/components/student/pricing-cards.tsx`: extrair para um
 * modulo compartilhado sairia da lista de arquivos deste work package.
 */
function missingMessage(fullKey: string): string {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`[i18n] chave de traducao ausente: ${fullKey}`);
  }
  return '';
}

/**
 * Seletor de moeda de exibicao/cobranca (ADR-0006 §2).
 *
 * - Apresentacional e controlado: nao le nem grava preferencia por conta
 *   propria. Isso evita a gravacao dupla que existia quando o componente
 *   chamava o PATCH sozinho alem do hook.
 * - Nenhuma promessa de que a cobranca sera feita nessa moeda (Zero Assumido):
 *   a moeda de registro efetiva e confirmada no checkout.
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
    t.has(key) ? t(key, values) : missingMessage(`credits.currency.${key}`);

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
        {busy && (
          <span
            data-testid={`${testId}-status`}
            role="status"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
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

      <p className="text-xs text-muted-foreground">
        {text('note')}
        {available.includes('USDC') && ` ${text('usdcNote')}`}
      </p>
    </div>
  );
}
