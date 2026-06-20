'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { SubscriptionStatus } from '@/lib/constants/enums';

interface SubscriptionResponse {
  data?: {
    status?: string;
    currentPeriodEnd?: string;
  } | null;
  error?: string | null;
}

interface PortalSessionResponse {
  data?: {
    url?: string;
  } | null;
  error?: string | null;
}

interface PastDueBannerProps {
  status?: string | null;
  currentPeriodEnd?: string | null;
  returnTo?: string;
}

function formatDate(value?: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function PastDueBanner({
  status,
  currentPeriodEnd,
  returnTo = '/billing/subscription?portal=returned',
}: PastDueBannerProps) {
  const [resolvedStatus, setResolvedStatus] = useState(status ?? null);
  const [resolvedPeriodEnd, setResolvedPeriodEnd] = useState(currentPeriodEnd ?? null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(!status);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  useEffect(() => {
    if (status) return;

    let active = true;

    async function loadSubscription() {
      try {
        const response = await fetch('/api/v1/subscriptions', {
          credentials: 'include',
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as SubscriptionResponse;
        if (!active) return;

        setResolvedStatus(payload.data?.status ?? null);
        setResolvedPeriodEnd(payload.data?.currentPeriodEnd ?? null);
      } finally {
        if (active) setIsLoadingStatus(false);
      }
    }

    void loadSubscription();

    return () => {
      active = false;
    };
  }, [status]);

  async function openPortal() {
    setIsOpeningPortal(true);

    try {
      const response = await fetch('/api/v1/billing/portal/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo }),
      });
      const payload = (await response.json().catch(() => ({}))) as PortalSessionResponse;

      if (!response.ok || !payload.data?.url) {
        toast.error(payload.error ?? 'Não foi possível abrir o portal de cobrança.');
        return;
      }

      toast.success('Redirecionando para o portal da Stripe.');
      window.location.assign(payload.data.url);
    } catch {
      toast.error('Erro de conexão ao abrir o portal de cobrança.');
    } finally {
      setIsOpeningPortal(false);
    }
  }

  if (isLoadingStatus || resolvedStatus !== SubscriptionStatus.PAST_DUE) {
    return null;
  }

  const periodEndLabel = formatDate(resolvedPeriodEnd);

  return (
    <section
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100"
      role="alert"
      aria-labelledby="past-due-banner-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="past-due-banner-title" className="text-sm font-semibold">
              Pagamento da assinatura pendente
            </h2>
            <p className="mt-1 text-sm leading-6">
              Atualize o método de pagamento para manter a assinatura ativa
              {periodEndLabel ? ` antes de ${periodEndLabel}` : ''}.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:min-w-48">
          <Button
            type="button"
            onClick={openPortal}
            disabled={isOpeningPortal}
            className="min-h-[44px] w-full"
            aria-busy={isOpeningPortal}
          >
            {isOpeningPortal ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Abrindo portal
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Atualizar pagamento
              </>
            )}
          </Button>
          <Link
            href={ROUTES.SUPPORT}
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-amber-300 bg-white/70 px-3 text-sm font-medium text-amber-950 transition-colors hover:bg-white dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          >
            Falar com suporte
          </Link>
        </div>
      </div>
    </section>
  );
}
