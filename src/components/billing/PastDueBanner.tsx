'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { CUSTOMER_PORTAL_RETURN_AFTER_PATH } from '@/lib/billing/customer-portal.config';
import { SubscriptionStatus } from '@/lib/constants/enums';

// ST-23 (Past Due banner). Abre o Customer Portal via redirect (hosted Stripe).
// Decisão canônica: ADR-0003 — embed inviável (X-Frame-Options); path de retorno
// centralizado em customer-portal.config.ts.

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

// Ate 2026-09-07 a data do fim do periodo saia sempre em 'pt-BR', mesmo para quem
// tinha escolhido outro idioma.
function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return null;

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function PastDueBanner({
  status,
  currentPeriodEnd,
  returnTo = CUSTOMER_PORTAL_RETURN_AFTER_PATH,
}: PastDueBannerProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo aluno — inclusive os toasts do portal da Stripe.
  const t = useTranslations('billing.pastDue');
  const locale = useLocale();
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
        toast.error(payload.error ?? t('portalError'));
        return;
      }

      toast.success(t('redirecting'));
      window.location.assign(payload.data.url);
    } catch {
      toast.error(t('connectionError'));
    } finally {
      setIsOpeningPortal(false);
    }
  }

  if (isLoadingStatus || resolvedStatus !== SubscriptionStatus.PAST_DUE) {
    return null;
  }

  const periodEndLabel = formatDate(resolvedPeriodEnd, locale);

  return (
    <section
      data-testid="billing-past-due-banner"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100"
      role="alert"
      aria-labelledby="past-due-banner-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="past-due-banner-title" className="text-sm font-semibold">
              {t('title')}
            </h2>
            {/*
              A frase era montada por concatenacao (" antes de {data}" grudado no
              fim). Cada idioma coloca a data num lugar diferente, entao a versao
              com prazo virou uma mensagem inteira e propria no catalogo.
            */}
            <p className="mt-1 text-sm leading-6">
              {periodEndLabel
                ? t('descriptionUntil', { date: periodEndLabel })
                : t('description')}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:min-w-48">
          <Button
            data-testid="billing-past-due-portal-button"
            type="button"
            onClick={openPortal}
            disabled={isOpeningPortal}
            className="min-h-[44px] w-full"
            aria-busy={isOpeningPortal}
          >
            {isOpeningPortal ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('opening')}
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {t('updatePayment')}
              </>
            )}
          </Button>
          <Link
            data-testid="billing-past-due-support-link"
            href={ROUTES.SUPPORT}
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-amber-300 bg-white/70 px-3 text-sm font-medium text-amber-950 transition-colors hover:bg-white dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          >
            {t('contactSupport')}
          </Link>
        </div>
      </div>
    </section>
  );
}
