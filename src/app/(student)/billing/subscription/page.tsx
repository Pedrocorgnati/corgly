'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CreditCard, ExternalLink, LifeBuoy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageWrapper } from '@/components/shared';
import { PastDueBanner } from '@/components/billing/PastDueBanner';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { ROUTES } from '@/lib/constants/routes';
import { CUSTOMER_PORTAL_RETURN_AFTER_PATH } from '@/lib/billing/customer-portal.config';
import { cn } from '@/lib/utils';

// ST-22 (Assinatura). Integração do Customer Portal = redirect para o portal
// hospedado da Stripe (embed inviável, X-Frame-Options). Decisão canônica:
// ADR-0003. Modo e path de retorno vêm de customer-portal.config.ts.

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

export default function BillingSubscriptionPage() {
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
        const message =
          payload.error ?? 'Não foi possível abrir o Customer Portal. Tente novamente.';
        setError(message);
        setSupportHref(payload.data?.supportCta?.href ?? ROUTES.SUPPORT);
        toast.error(message);
        return;
      }

      toast.success('Redirecionando para o portal da Stripe.');
      window.location.assign(payload.data.url);
    } catch {
      const message = 'Erro de conexão ao abrir o Customer Portal. Tente novamente.';
      setError(message);
      toast.error(message);
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <PageWrapper className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <CreditCard className="h-6 w-6 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assinatura</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Gerencie pagamento, assinatura e dados de cobrança no Customer Portal da Stripe.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <PastDueBanner />

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">
                Alterar frequência do plano
              </h2>
              <p className="max-w-xl text-sm text-muted-foreground">
                Simule a cobrança proporcional, impostos estimados e data efetiva antes de confirmar
                upgrade ou downgrade da assinatura.
              </p>
            </div>
            <Link
              href={ROUTES.BILLING_SUBSCRIPTION_CHANGE}
              className={cn(buttonVariants({ variant: 'outline' }), 'min-h-[44px] shrink-0')}
            >
              Simular mudança
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">
                Portal seguro da Stripe
              </h2>
              <p className="max-w-xl text-sm text-muted-foreground">
                Abra uma sessão autenticada para atualizar método de pagamento,
                ver dados da assinatura ou resolver cobranças pendentes. Ao finalizar,
                você volta para esta página.
              </p>
            </div>
            <Button
              type="button"
              onClick={openCustomerPortal}
              disabled={isOpening}
              className="min-h-[44px] shrink-0"
              aria-busy={isOpening}
            >
              {isOpening ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Abrindo portal
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Abrir portal
                </>
              )}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold">Pagamento pendente</h2>
              <p className="mt-1 text-sm">
                Se sua assinatura estiver em PAST_DUE, use o portal para atualizar
                o método de pagamento. O retorno para a app é restrito ao domínio
                configurado da Corgly.
              </p>
            </div>
          </div>
        </section>

        {error && (
          <section
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-4"
            role="alert"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Suporte financeiro
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                </div>
              </div>
              <Link
                href={supportHref}
                className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Falar com suporte
              </Link>
            </div>
          </section>
        )}
      </div>
    </PageWrapper>
  );
}
