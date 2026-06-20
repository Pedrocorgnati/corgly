'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  LifeBuoy,
  Loader2,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageWrapper } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { ROUTES } from '@/lib/constants/routes';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  funding: string | null;
  isDefault: boolean;
  createdAt: string | null;
}

interface ApiResponse<T> {
  data?: T | null;
  error?: string | null;
  message?: string | null;
  code?: string;
}

interface PaymentMethodsData {
  items: PaymentMethod[];
  defaultPaymentMethodId: string | null;
}

interface PortalSessionData {
  url?: string;
  supportCta?: {
    label: string;
    href: string;
  };
}

function supportHrefFrom(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('supportCta' in data)) return null;

  const supportCta = (data as PortalSessionData).supportCta;
  return supportCta?.href ?? null;
}

function formatBrand(brand: string) {
  return brand ? brand.toUpperCase() : 'CARD';
}

function formatExpiration(paymentMethod: PaymentMethod) {
  return `${String(paymentMethod.expMonth).padStart(2, '0')}/${paymentMethod.expYear}`;
}

export default function BillingPaymentMethodsPage() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isPreparingSetupIntent, setIsPreparingSetupIntent] = useState(false);
  const [updatingPaymentMethodId, setUpdatingPaymentMethodId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportHref, setSupportHref] = useState<string>(ROUTES.SUPPORT);

  const hasPaymentMethods = paymentMethods.length > 0;
  const defaultPaymentMethod = useMemo(
    () => paymentMethods.find((paymentMethod) => paymentMethod.id === defaultPaymentMethodId),
    [defaultPaymentMethodId, paymentMethods],
  );

  const loadPaymentMethods = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/billing/payment-methods', {
        method: 'GET',
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<PaymentMethodsData>;

      if (!response.ok || !payload.data) {
        const message = payload.error ?? 'Não foi possível carregar métodos de pagamento.';
        setError(message);
        setSupportHref(supportHrefFrom(payload.data) ?? ROUTES.SUPPORT);
        return;
      }

      setPaymentMethods(payload.data.items);
      setDefaultPaymentMethodId(payload.data.defaultPaymentMethodId);
    } catch {
      setError('Erro de conexão ao carregar métodos de pagamento.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPaymentMethods();
  }, [loadPaymentMethods]);

  async function prepareSetupIntent() {
    setIsPreparingSetupIntent(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/billing/setup-intent', {
        method: 'POST',
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<{
        setupIntentId: string;
        clientSecret: string;
      }>;

      if (!response.ok || !payload.data?.setupIntentId) {
        const message = payload.error ?? 'Não foi possível preparar método de pagamento.';
        setError(message);
        setSupportHref(supportHrefFrom(payload.data) ?? ROUTES.SUPPORT);
        toast.error(message);
        return;
      }

      toast.success('Método preparado com segurança pela Stripe.');
    } catch {
      const message = 'Erro de conexão ao preparar método de pagamento.';
      setError(message);
      toast.error(message);
    } finally {
      setIsPreparingSetupIntent(false);
    }
  }

  async function openCustomerPortal() {
    setIsOpeningPortal(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/billing/portal/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: '/billing/payment-methods?portal=returned' }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<PortalSessionData>;

      if (!response.ok || !payload.data?.url) {
        const message = payload.error ?? 'Não foi possível abrir o portal de pagamento.';
        setError(message);
        setSupportHref(payload.data?.supportCta?.href ?? ROUTES.SUPPORT);
        toast.error(message);
        return;
      }

      toast.success('Redirecionando para a Stripe.');
      window.location.assign(payload.data.url);
    } catch {
      const message = 'Erro de conexão ao abrir o portal de pagamento.';
      setError(message);
      toast.error(message);
    } finally {
      setIsOpeningPortal(false);
    }
  }

  async function setDefaultPaymentMethod(paymentMethodId: string) {
    setUpdatingPaymentMethodId(paymentMethodId);
    setError(null);

    try {
      const response = await fetch('/api/v1/billing/payment-methods', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<PaymentMethodsData>;

      if (!response.ok || !payload.data) {
        const message = payload.error ?? 'Não foi possível atualizar método padrão.';
        setError(message);
        toast.error(message);
        return;
      }

      setPaymentMethods(payload.data.items);
      setDefaultPaymentMethodId(payload.data.defaultPaymentMethodId);
      toast.success('Método padrão atualizado.');
    } catch {
      const message = 'Erro de conexão ao atualizar método padrão.';
      setError(message);
      toast.error(message);
    } finally {
      setUpdatingPaymentMethodId(null);
    }
  }

  return (
    <PageWrapper className="max-w-4xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-1 h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Métodos de pagamento</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Cartões salvos, método padrão e portal financeiro da Stripe.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={prepareSetupIntent}
            disabled={isPreparingSetupIntent}
            aria-busy={isPreparingSetupIntent}
          >
            {isPreparingSetupIntent ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Preparar método
          </Button>
          <Button
            type="button"
            onClick={openCustomerPortal}
            disabled={isOpeningPortal}
            aria-busy={isOpeningPortal}
          >
            {isOpeningPortal ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            )}
            Abrir portal
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {defaultPaymentMethod && (
          <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Método padrão</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatBrand(defaultPaymentMethod.brand)} final {defaultPaymentMethod.last4}
                  {' · '}expira em {formatExpiration(defaultPaymentMethod)}.
                </p>
              </div>
            </div>
          </section>
        )}

        {error && (
          <section
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-4"
            role="alert"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Atenção no pagamento
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                </div>
              </div>
              <Link
                href={supportHref}
                className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <LifeBuoy className="mr-2 h-4 w-4" aria-hidden="true" />
                Falar com suporte
              </Link>
            </div>
          </section>
        )}

        {isLoading ? (
          <LoadingState variant="skeleton" message="Carregando métodos de pagamento" />
        ) : !hasPaymentMethods && !error ? (
          <section className="rounded-lg border border-border bg-card">
            <EmptyState
              icon={CreditCard}
              title="Nenhum método salvo"
              description="Abra o portal para adicionar ou revisar cartões vinculados à assinatura."
              actionLabel="Abrir portal"
              onAction={openCustomerPortal}
            />
          </section>
        ) : error && !hasPaymentMethods ? (
          <section className="rounded-lg border border-border bg-card">
            <ErrorState message={error} onRetry={loadPaymentMethods} />
          </section>
        ) : (
          <section className="grid gap-3">
            {paymentMethods.map((paymentMethod) => {
              const isUpdating = updatingPaymentMethodId === paymentMethod.id;

              return (
                <Card key={paymentMethod.id} size="sm" className="rounded-lg">
                  <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                        <CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle>
                          {formatBrand(paymentMethod.brand)} final {paymentMethod.last4}
                        </CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Expira em {formatExpiration(paymentMethod)}
                          {paymentMethod.funding ? ` · ${paymentMethod.funding}` : ''}
                        </p>
                      </div>
                    </div>
                    {paymentMethod.isDefault ? (
                      <Badge variant="secondary" className="justify-self-start sm:justify-self-end">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Padrão
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDefaultPaymentMethod(paymentMethod.id)}
                        disabled={isUpdating}
                        aria-busy={isUpdating}
                        className="justify-self-start sm:justify-self-end"
                      >
                        {isUpdating && (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        )}
                        Definir padrão
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Identificador seguro: {paymentMethod.id}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        )}
      </div>
    </PageWrapper>
  );
}
