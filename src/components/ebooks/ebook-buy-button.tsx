'use client';

import { useId, useRef, useState } from 'react';

import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

export interface EbookBuyButtonLabels {
  buy: string;
  loading: string;
  waiver: string;
}

export interface EbookBuyButtonErrors {
  rateLimited: string;
  rateLimitedNoWait: string;
  failed: string;
  network: string;
}

export interface EbookBuyButtonProps {
  slug: string;
  labels: EbookBuyButtonLabels;
  errors: EbookBuyButtonErrors;
  checkoutUnavailable: string;
  checkoutFailed: string;
}

// Estados possiveis do botao; erro carrega a mensagem ja resolvida.
type BuyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string };

type BuyErrorContext = Pick<
  EbookBuyButtonProps,
  'errors' | 'checkoutUnavailable' | 'checkoutFailed'
>;

function readField(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}

function resolveErrorMessage(
  code: unknown,
  response: Response,
  context: BuyErrorContext,
): string {
  if (code === 'EBOOK_CHECKOUT_RATE_LIMITED') {
    const retryAfter = response.headers.get('Retry-After');
    // So vale inteiro positivo; fora do padrao nao ha espera informada.
    if (retryAfter !== null && /^\d+$/.test(retryAfter)) {
      const seconds = Number(retryAfter);
      if (seconds > 0) {
        return context.errors.rateLimited.replace('{seconds}', String(seconds));
      }
    }
    return context.errors.rateLimitedNoWait;
  }
  if (code === 'EBOOK_CHECKOUT_UNAVAILABLE') return context.checkoutUnavailable;
  if (code === 'EBOOK_CHECKOUT_GATEWAY_ERROR' || code === 'EBOOK_CHECKOUT_GATEWAY_TIMEOUT') {
    return context.checkoutFailed;
  }
  return context.errors.failed;
}

export function EbookBuyButton({
  slug,
  labels,
  errors,
  checkoutUnavailable,
  checkoutFailed,
}: EbookBuyButtonProps) {
  const waiverId = useId();
  const [waiverChecked, setWaiverChecked] = useState(false);
  const [state, setState] = useState<BuyState>({ status: 'idle' });
  // Guard sincronizado: cobre duplo clique antes do re-render do loading.
  const loadingRef = useRef(false);

  async function handleBuy() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    // Nova tentativa limpa o erro anterior; erro so some aqui.
    setState({ status: 'loading' });

    let response: Response;
    try {
      response = await fetch('/api/v1/ebooks/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, withdrawalWaiver: true }),
      });
    } catch {
      // Somente fetch rejeitado conta como falha de rede.
      loadingRef.current = false;
      setState({ status: 'error', message: errors.network });
      return;
    }

    // JSON invalido vira null e cai no fallback "failed".
    const body = (await response.json().catch(() => null)) as unknown;
    const checkoutUrl = readField(readField(body, 'data'), 'checkoutUrl');

    if (response.status === 201 && typeof checkoutUrl === 'string' && checkoutUrl.length > 0) {
      // Permanece em loading ate a navegacao; nenhum clique e aceito depois.
      window.location.assign(checkoutUrl);
      return;
    }

    loadingRef.current = false;
    setState({
      status: 'error',
      message: resolveErrorMessage(readField(body, 'code'), response, {
        errors,
        checkoutUnavailable,
        checkoutFailed,
      }),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <input
          id={waiverId}
          type="checkbox"
          checked={waiverChecked}
          onChange={(event) => setWaiverChecked(event.target.checked)}
          data-testid="ebook-buy-waiver"
          className="mt-1 size-4 shrink-0 accent-primary"
        />
        <label htmlFor={waiverId} className="text-sm text-muted-foreground">
          {labels.waiver}
        </label>
      </div>
      <button
        type="button"
        onClick={handleBuy}
        disabled={!waiverChecked || state.status === 'loading'}
        aria-busy={state.status === 'loading' ? 'true' : undefined}
        data-testid="ebook-buy-button"
        className={cn(buttonVariants({ size: 'lg' }))}
      >
        {state.status === 'loading' ? labels.loading : labels.buy}
      </button>
      {state.status === 'error' ? (
        <p role="alert" data-testid="ebook-buy-error" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
