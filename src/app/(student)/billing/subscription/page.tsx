'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CreditCard, ExternalLink, LifeBuoy, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { PageWrapper } from '@/components/shared';
import { PastDueBanner } from '@/components/billing/PastDueBanner';
import { SubscriptionManager } from '@/components/billing/subscription-manager';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { CUSTOMER_PORTAL_RETURN_AFTER_PATH } from '@/lib/billing/customer-portal.config';

// ST-22 (Assinatura). Integracao do Customer Portal = redirect para o portal
// hospedado da Stripe (embed inviavel, X-Frame-Options). Decisao canonica:
// ADR-0003. Modo e path de retorno vem de customer-portal.config.ts.

interface PortalSessionResponse {
  data?: {
    url?: string;
    supportCta?: {
      label: string;
      href: string;
    };
  } | null;
  error?: string | null;
}

/**
 * Traducao obrigatoria: chave ausente e DEFEITO, nao texto opcional.
 * Em desenvolvimento estoura no primeiro render; em producao devolve string
 * vazia — a chave crua NUNCA aparece para o usuario final.
 *
 * DUPLICADO nos outros arquivos deste work package: um modulo compartilhado
 * ficaria fora da lista de arquivos de propriedade.
 */
function missingMessage(fullKey: string): string {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`[i18n] chave de traducao ausente: ${fullKey}`);
  }
  return '';
}

export default function BillingSubscriptionPage() {
  const t = useTranslations('credits.subscription');
  const text = (key: string): string =>
    t.has(key) ? t(key) : missingMessage(`credits.subscription.${key}`);

  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportHref, setSupportHref] = useState<string>(ROUTES.SUPPORT);

  async function openCustomerPortal() {
    setIsOpening(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/billing/portal/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: CUSTOMER_PORTAL_RETURN_AFTER_PATH }),
      });
      const payload = (await response.json().catch(() => ({}))) as PortalSessionResponse;

      if (!response.ok || !payload.data?.url) {
        const message = payload.error ?? text('portalError');
        setError(message);
        setSupportHref(payload.data?.supportCta?.href ?? ROUTES.SUPPORT);
        toast.error(message);
        return;
      }

      toast.success(text('portalRedirecting'));
      window.location.assign(payload.data.url);
    } catch {
      const message = text('portalConnectionError');
      setError(message);
      toast.error(message);
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <PageWrapper data-testid="page-billing-subscription" className="max-w-3xl">
      <div data-testid="billing-subscription-header" className="mb-6 flex items-center gap-3">
        <CreditCard className="h-6 w-6 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{text('pageTitle')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{text('pageSubtitle')}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div data-testid="billing-subscription-past-due-banner">
          <PastDueBanner />
        </div>

        {/*
          O plano vigente e mostrado pelo eixo em que foi contratado ("N aulas
          por mes" no eixo canonico, "Nx por semana" no legado) pelo mesmo
          componente da aba de cobranca — o link de troca de plano e o
          cancelamento vivem dentro dele, sem CTA duplicado nesta pagina.
        */}
        <section
          data-testid="billing-subscription-plan-section"
          className="rounded-lg border border-border bg-card p-5"
        >
          <h2 className="mb-4 text-base font-semibold text-foreground">
            {text('planSectionTitle')}
          </h2>
          <SubscriptionManager />
        </section>

        <section data-testid="billing-subscription-portal-section" className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">{text('portalTitle')}</h2>
              <p className="max-w-xl text-sm text-muted-foreground">{text('portalDesc')}</p>
            </div>
            <Button
              data-testid="billing-subscription-portal-button"
              type="button"
              onClick={openCustomerPortal}
              disabled={isOpening}
              className="min-h-[44px] shrink-0"
              aria-busy={isOpening}
            >
              {isOpening ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {text('portalOpening')}
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {text('portalCta')}
                </>
              )}
            </Button>
          </div>
        </section>

        <section data-testid="billing-subscription-past-due-notice" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold">{text('pastDue')}</h2>
              <p className="mt-1 text-sm">{text('pastDueNotice')}</p>
            </div>
          </div>
        </section>

        {error && (
          <section
            data-testid="billing-subscription-error"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-4"
            role="alert"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{text('supportTitle')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                </div>
              </div>
              <Link
                href={supportHref}
                data-testid="billing-subscription-support-link"
                className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {text('supportCta')}
              </Link>
            </div>
          </section>
        )}
      </div>
    </PageWrapper>
  );
}
