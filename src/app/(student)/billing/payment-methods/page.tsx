'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
  // Idioma resolvido no servidor (i18n/request.ts). Ate 2026-09-07 esta pagina
  // escrevia portugues cravado e ignorava o idioma escolhido pelo aluno.
  const t = useTranslations('pages.paymentMethods');
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
        const message = payload.error ?? t('loadError');
        setError(message);
        setSupportHref(supportHrefFrom(payload.data) ?? ROUTES.SUPPORT);
        return;
      }

      setPaymentMethods(payload.data.items);
      setDefaultPaymentMethodId(payload.data.defaultPaymentMethodId);
    } catch {
      setError(t('loadConnectionError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

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
        const message = payload.error ?? t('prepareError');
        setError(message);
        setSupportHref(supportHrefFrom(payload.data) ?? ROUTES.SUPPORT);
        toast.error(message);
        return;
      }

      toast.success(t('prepareSuccess'));
    } catch {
      const message = t('prepareConnectionError');
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
        const message = payload.error ?? t('portalError');
        setError(message);
        setSupportHref(payload.data?.supportCta?.href ?? ROUTES.SUPPORT);
        toast.error(message);
        return;
      }

      toast.success(t('portalRedirecting'));
      window.location.assign(payload.data.url);
    } catch {
      const message = t('portalConnectionError');
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
        const message = payload.error ?? t('defaultError');
        setError(message);
        toast.error(message);
        return;
      }

      setPaymentMethods(payload.data.items);
      setDefaultPaymentMethodId(payload.data.defaultPaymentMethodId);
      toast.success(t('defaultSuccess'));
    } catch {
      const message = t('defaultConnectionError');
      setError(message);
      toast.error(message);
    } finally {
      setUpdatingPaymentMethodId(null);
    }
  }

  return (
    <PageWrapper data-testid="page-billing-payment-methods" className="max-w-4xl">
      <div data-testid="billing-payment-methods-header" className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-1 h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            data-testid="billing-payment-methods-prepare-button"
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
            {t('prepare')}
          </Button>
          <Button
            data-testid="billing-payment-methods-portal-button"
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
            {t('openPortal')}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {defaultPaymentMethod && (
          <section data-testid="billing-payment-methods-default-summary" className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">{t('defaultTitle')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('defaultLine', {
                    brand: formatBrand(defaultPaymentMethod.brand),
                    last4: defaultPaymentMethod.last4,
                    expiry: formatExpiration(defaultPaymentMethod),
                  })}
                </p>
              </div>
            </div>
          </section>
        )}

        {error && (
          <section
            data-testid="billing-payment-methods-error"
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
                  <h2 className="text-sm font-semibold text-foreground">{t('errorTitle')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                </div>
              </div>
              <Link
                href={supportHref}
                data-testid="billing-payment-methods-support-link"
                className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <LifeBuoy className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('contactSupport')}
              </Link>
            </div>
          </section>
        )}

        {isLoading ? (
          <LoadingState data-testid="billing-payment-methods-loading" variant="skeleton" message={t('loading')} />
        ) : !hasPaymentMethods && !error ? (
          <section className="rounded-lg border border-border bg-card">
            <EmptyState
              data-testid="billing-payment-methods-empty"
              icon={CreditCard}
              title={t('emptyTitle')}
              description={t('emptyDesc')}
              actionLabel={t('openPortal')}
              onAction={openCustomerPortal}
            />
          </section>
        ) : error && !hasPaymentMethods ? (
          <section className="rounded-lg border border-border bg-card">
            <ErrorState data-testid="billing-payment-methods-error-state" message={error} onRetry={loadPaymentMethods} />
          </section>
        ) : (
          <section data-testid="billing-payment-methods-list" className="grid gap-3">
            {paymentMethods.map((paymentMethod) => {
              const isUpdating = updatingPaymentMethodId === paymentMethod.id;

              return (
                <Card key={paymentMethod.id} data-testid={`billing-payment-method-card-${paymentMethod.id}`} size="sm" className="rounded-lg">
                  <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                        <CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle>
                          {t('cardLabel', {
                            brand: formatBrand(paymentMethod.brand),
                            last4: paymentMethod.last4,
                          })}
                        </CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('expires', { expiry: formatExpiration(paymentMethod) })}
                          {paymentMethod.funding ? ` · ${paymentMethod.funding}` : ''}
                        </p>
                      </div>
                    </div>
                    {paymentMethod.isDefault ? (
                      <Badge data-testid={`billing-payment-method-default-badge-${paymentMethod.id}`} variant="secondary" className="justify-self-start sm:justify-self-end">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        {t('defaultBadge')}
                      </Badge>
                    ) : (
                      <Button
                        data-testid={`billing-payment-method-set-default-${paymentMethod.id}-button`}
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
                        {t('setDefault')}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {t('secureId', { id: paymentMethod.id })}
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
