'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  RefreshCw,
  Star,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { apiClient, ApiError } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import { PriceDisplay } from '@/components/billing/PriceDisplay';
import { CurrencySelector } from '@/components/billing/CurrencySelector';
import { useUserCurrency } from '@/lib/hooks/use-user-currency';
import type { Currency } from '@/lib/currency';
import { monthlyPackageType, resolvePrice } from '@/lib/pricing/config';
import {
  MONTHLY_OPTIONS,
  type LandingPlanId,
  type MonthlyLessons,
  clearPlanSelection,
  readPlanSelection,
} from '@/lib/constants/landing';
import { missingMessage } from '@/lib/i18n/message-fallback';

/**
 * Vitrine do dashboard — espelho da vitrine publica (`landing/pricing-section`).
 *
 * TRES planos: SINGLE, PACK_10 e MONTHLY (10 ou 20 aulas/mes). PACK_5 saiu da
 * vitrine, mas continua suportado no backend (PRICING, creditos e checkout)
 * para nao quebrar compras antigas.
 *
 * CADA preco sai de `resolvePrice` (unica tabela multi-moeda do produto) e e
 * renderizado por `PriceDisplay`. NAO existe aritmetica de cambio aqui: as
 * unicas divisoes feitas neste arquivo sao preco-total / numero-de-aulas, que
 * dividem creditos, nao moeda.
 *
 * O identificador de plano e o MESMO da vitrine publica (`LandingPlanId`, em
 * `src/lib/constants/landing.ts`). Este arquivo mantinha um `ShowcasePlanId`
 * proprio com os mesmos tres literais: duas unioes fechadas para o mesmo
 * catalogo, livres para divergir sem que compilador ou teste reclamassem — e o
 * `?plan=` que a landing monta e lido por essa mesma uniao do outro lado.
 */

const FEATURE_ICONS = {
  SINGLE: [Calendar, Clock],
  PACK_10: [Layers, Calendar],
  MONTHLY: [TrendingUp, RefreshCw],
} as const;

const PACK_10_CREDITS = 10;

/** Preco por aula = total / creditos. Divisao de creditos, nunca de cambio. */
function perLessonCents(totalCents: number, lessons: number): number {
  return Math.round(totalCents / lessons);
}

export interface PricingCardsProps {
  /** Habilita o preco promocional de primeira aula no plano avulso. */
  isFirstPurchase?: boolean;
  /** Plano vindo da landing (`?plan=`). Plano desconhecido chega como null. */
  initialPlan?: LandingPlanId | null;
  /** Volume mensal vindo da landing (`?lessons=`). Default: 10 aulas. */
  initialMonthlyLessons?: MonthlyLessons | null;
}

export function PricingCards({
  isFirstPurchase = false,
  initialPlan = null,
  initialMonthlyLessons = null,
}: PricingCardsProps) {
  const t = useTranslations('credits.pricing');
  const tl = useTranslations('landing.pricing');
  const locale = useLocale();
  const { currency, isLoading, isSaving, error, setCurrency, reload } = useUserCurrency();
  const [loadingPlan, setLoadingPlan] = useState<LandingPlanId | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<LandingPlanId | null>(initialPlan);
  const [monthlyLessons, setMonthlyLessons] = useState<MonthlyLessons>(
    initialMonthlyLessons ?? MONTHLY_OPTIONS[0].lessons,
  );

  /**
   * Ultimo elo da ponte landing -> cadastro -> vitrine.
   *
   * Quando o aluno chega pela URL (`/credits?plan=...`), a query manda e o
   * registro guardado no cadastro ja cumpriu o papel dele: e apagado para nao
   * ressurgir numa visita futura. Quando chega sem query — caso do aluno que
   * atravessou confirmacao de e-mail e login — a escolha e recuperada do
   * registro, aplicada UMA vez e apagada em seguida.
   *
   * Roda em efeito, nunca no render: ler `localStorage` durante o render quebra
   * a hidratacao (servidor nao tem storage).
   */
  useEffect(() => {
    if (initialPlan) {
      clearPlanSelection();
      return;
    }
    const saved = readPlanSelection();
    if (!saved) return;
    clearPlanSelection();
    setSelectedPlan(saved.plan);
    if (saved.plan === 'MONTHLY' && saved.monthlyLessons) {
      setMonthlyLessons(saved.monthlyLessons);
    }
  }, [initialPlan]);

  const text = (key: string, values?: Record<string, string | number>): string =>
    t.has(key) ? t(key, values) : missingMessage(`credits.pricing.${key}`, 'PricingCards');

  const landing = (key: string, values?: Record<string, string | number>): string =>
    tl.has(key) ? tl(key, values) : missingMessage(`landing.pricing.${key}`, 'PricingCards');

  const landingList = (key: string): string[] => {
    if (!tl.has(key)) {
      missingMessage(`landing.pricing.${key}`, 'PricingCards');
      return [];
    }
    const raw = tl.raw(key);
    if (!Array.isArray(raw)) {
      missingMessage(`landing.pricing.${key}`, 'PricingCards');
      return [];
    }
    return raw.filter((item): item is string => typeof item === 'string');
  };

  const singleCents = resolvePrice('SINGLE', currency).amountCents;
  const promoCents = resolvePrice('PROMO', currency).amountCents;
  const pack10Cents = resolvePrice('PACK_10', currency).amountCents;
  const monthlyCents = resolvePrice(monthlyPackageType(monthlyLessons), currency).amountCents;

  async function handleBuy(plan: LandingPlanId) {
    setLoadingPlan(plan);
    try {
      // MONTHLY usa o eixo canonico `monthlyLessons` (10 ou 20). SINGLE e
      // PACK_10 seguem no eixo `packageType`. O desconto de primeira aula e
      // aplicado pelo servidor (PROMO), nao pelo cliente.
      const body =
        plan === 'MONTHLY'
          ? { isSubscription: true, monthlyLessons, currency }
          : { packageType: plan, isSubscription: false, currency };

      const response = await apiClient.post<{ data: { url?: string } }>(API.CHECKOUT, body);
      const url = response.data?.url;
      if (!url) {
        throw new ApiError('checkout-url-ausente', 502, 'CHECKOUT_URL_MISSING');
      }
      toast.loading(text('redirecting'));
      window.location.href = url;
    } catch (err) {
      toast.error(text('checkoutError'), {
        description: err instanceof ApiError && err.message ? err.message : undefined,
      });
      setLoadingPlan(null);
    }
  }

  function renderCta(plan: LandingPlanId, popular: boolean) {
    const busy = loadingPlan === plan;
    return (
      <Button
        data-testid={`credits-package-${plan.toLowerCase()}-buy-button`}
        onClick={() => void handleBuy(plan)}
        disabled={loadingPlan !== null}
        variant={popular ? 'default' : 'outline'}
        className={cn(
          'mt-6 w-full min-h-[48px]',
          !popular && 'border-primary text-primary hover:bg-primary/5',
        )}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
            {plan === 'MONTHLY' ? text('subscribing') : text('buying')}
          </>
        ) : plan === 'MONTHLY' ? (
          text('subscribeBtn')
        ) : (
          text('buyBtn')
        )}
      </Button>
    );
  }

  /**
   * A chave da lista fica no CHAMADOR, nao aqui: passada como parametro, ela
   * vira expressao e a varredura de `src/__tests__/i18n/consumed-keys.test.ts`
   * nao consegue provar que existe no catalogo — a lista de features poderia
   * sumir dos quatro locales sem nenhum teste ficar vermelho.
   */
  function renderFeatures(plan: LandingPlanId, features: string[]) {
    const icons = FEATURE_ICONS[plan];
    return (
      <ul className="mt-5 space-y-2.5">
        {features.map((feature, index) => {
          const Icon = icons[index] ?? CheckCircle2;
          return (
            <li key={feature} className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Icon className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
              {feature}
            </li>
          );
        })}
      </ul>
    );
  }

  function renderSelectedNote(plan: LandingPlanId) {
    if (selectedPlan !== plan) return null;
    return (
      <p
        data-testid={`credits-package-${plan.toLowerCase()}-selected-note`}
        className="mt-3 text-xs font-medium text-primary"
      >
        {text('selectedPlan')}
      </p>
    );
  }

  const cardBase = 'bg-card rounded-2xl px-6 py-7 flex flex-col relative';

  return (
    <>
      <div className="mb-6 flex justify-end">
        <CurrencySelector
          data-testid="credits-currency-select"
          value={currency}
          onChange={(next: Currency) => setCurrency(next)}
          isLoading={isLoading}
          isSaving={isSaving}
          error={error}
          onRetry={reload}
          className="items-end text-right"
        />
      </div>

      <div
        data-testid="credits-packages"
        className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch"
      >
        {/* ---------------------------------------------------------- SINGLE */}
        <div
          data-testid="credits-package-single"
          data-selected={selectedPlan === 'SINGLE' ? 'true' : undefined}
          className={cn(
            cardBase,
            'border border-border shadow-sm',
            selectedPlan === 'SINGLE' && 'ring-2 ring-primary/40',
          )}
        >
          <h3 className="text-lg font-bold text-foreground">{text('singleTitle')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{text('singleDesc')}</p>
          <span className="mt-3 block h-[3px] w-9 rounded-full bg-primary/60" aria-hidden="true" />

          {isFirstPurchase ? (
            <>
              <p className="mt-6 text-xs text-muted-foreground">{landing('first_lesson_label')}</p>
              <p className="mt-1 flex items-baseline gap-2.5">
                <PriceDisplay
                  amountCents={promoCents}
                  currency={currency}
                  locale={locale}
                  className="text-3xl font-bold tracking-tight text-foreground"
                />
                <PriceDisplay
                  amountCents={singleCents}
                  currency={currency}
                  locale={locale}
                  className="text-base text-muted-foreground line-through"
                />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{text('firstPurchaseNote')}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                {landing('following_lessons_label')}
              </p>
            </>
          ) : (
            <p className="mt-6 text-xs text-muted-foreground">{landing('per_lesson')}</p>
          )}

          <p className="mt-1 flex items-baseline gap-1">
            <PriceDisplay
              amountCents={singleCents}
              currency={currency}
              locale={locale}
              className="text-3xl font-bold tracking-tight text-foreground"
            />
            <span className="text-sm font-medium text-muted-foreground">
              {landing('per_lesson_suffix')}
            </span>
          </p>

          {renderSelectedNote('SINGLE')}
          {renderCta('SINGLE', false)}
          {renderFeatures('SINGLE', landingList('packages.single.features'))}
        </div>

        {/* --------------------------------------------------------- PACK_10 */}
        <div
          data-testid="credits-package-pack_10"
          data-selected={selectedPlan === 'PACK_10' ? 'true' : undefined}
          className={cn(
            cardBase,
            'border-2 border-primary shadow-lg shadow-primary/10',
            selectedPlan === 'PACK_10' && 'ring-2 ring-primary/40',
          )}
        >
          <Badge
            data-testid="credits-package-badge"
            className="absolute -top-3 left-1/2 -translate-x-1/2 h-auto gap-1 px-3 py-1"
          >
            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
            {landing('most_chosen')}
          </Badge>

          <h3 className="text-lg font-bold text-foreground">{text('pack10Title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{text('pack10Desc')}</p>
          <span className="mt-3 block h-[3px] w-9 rounded-full bg-primary" aria-hidden="true" />

          <PriceDisplay
            amountCents={pack10Cents}
            currency={currency}
            locale={locale}
            className="mt-6 block text-4xl font-bold tracking-tight text-foreground"
          />
          <p className="mt-3 text-xs text-muted-foreground">{landing('equivalent_to')}</p>
          <p className="mt-1 flex items-baseline gap-1">
            <PriceDisplay
              amountCents={perLessonCents(pack10Cents, PACK_10_CREDITS)}
              currency={currency}
              locale={locale}
              className="text-3xl font-bold tracking-tight text-primary"
            />
            <span className="text-sm font-medium text-primary/80">
              {landing('per_lesson_suffix')}
            </span>
          </p>

          {renderSelectedNote('PACK_10')}
          {renderCta('PACK_10', true)}
          {renderFeatures('PACK_10', landingList('packages.pack10.features'))}
        </div>

        {/* --------------------------------------------------------- MONTHLY */}
        <div
          data-testid="credits-package-monthly"
          data-selected={selectedPlan === 'MONTHLY' ? 'true' : undefined}
          className={cn(
            cardBase,
            'border border-border shadow-sm',
            selectedPlan === 'MONTHLY' && 'ring-2 ring-primary/40',
          )}
        >
          <h3 className="text-lg font-bold text-foreground">{text('monthlyTitle')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{text('monthlyDesc')}</p>
          <span className="mt-3 block h-[3px] w-9 rounded-full bg-primary/60" aria-hidden="true" />

          <div
            data-testid="credits-monthly-options"
            role="radiogroup"
            aria-label={landing('monthly_options_aria')}
            className="mt-5 grid grid-cols-2 gap-2"
          >
            {MONTHLY_OPTIONS.map((option) => {
              const selected = monthlyLessons === option.lessons;
              const optionTotalCents = resolvePrice(
                monthlyPackageType(option.lessons),
                currency,
              ).amountCents;
              return (
                <button
                  key={option.lessons}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`credits-monthly-option-${option.lessons}`}
                  onClick={() => setMonthlyLessons(option.lessons)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-left transition-colors',
                    selected
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:border-primary/50',
                  )}
                >
                  <span className="block text-xs font-semibold text-foreground">
                    {landing('monthly_option', { count: option.lessons })}
                  </span>
                  <span className="mt-0.5 flex items-baseline gap-0.5">
                    <PriceDisplay
                      amountCents={perLessonCents(optionTotalCents, option.lessons)}
                      currency={currency}
                      locale={locale}
                      className="text-xs text-muted-foreground"
                    />
                    <span className="text-xs text-muted-foreground">
                      {landing('per_lesson_suffix')}
                    </span>
                  </span>
                  {option.lessons === 20 && (
                    <span className="mt-0.5 block text-[11px] font-medium text-primary">
                      {landing('best_cost')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <PriceDisplay
            amountCents={monthlyCents}
            currency={currency}
            locale={locale}
            className="mt-6 block text-4xl font-bold tracking-tight text-foreground"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {landing('per_month', { count: monthlyLessons })}
          </p>
          <p className="mt-3 flex items-baseline gap-1">
            <PriceDisplay
              amountCents={perLessonCents(monthlyCents, monthlyLessons)}
              currency={currency}
              locale={locale}
              className="text-3xl font-bold tracking-tight text-primary"
            />
            <span className="text-sm font-medium text-primary/80">
              {landing('per_lesson_suffix')}
            </span>
          </p>
          {monthlyLessons === 20 && (
            <p className="mt-1 text-xs font-medium text-primary">{landing('best_cost')}</p>
          )}

          {renderSelectedNote('MONTHLY')}
          {renderCta('MONTHLY', false)}
          {renderFeatures('MONTHLY', landingList('packages.monthly.features'))}
        </div>
      </div>

      <p
        data-testid="credits-packages-footnote"
        className="mt-8 text-center text-xs text-muted-foreground"
      >
        {landing('footnote_credits')}
        <span className="mx-1.5 text-primary" aria-hidden="true">
          &bull;
        </span>
        {landing('footnote_cancel')}
      </p>
    </>
  );
}
