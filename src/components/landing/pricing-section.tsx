'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, Clock, Layers, Loader2, RefreshCw, Star, Ticket, TrendingUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  FIRST_LESSON_USD,
  SINGLE_USD,
  PACK10_USD,
  PACK10_PER,
  MONTHLY_OPTIONS,
  type MonthlyLessons,
  monthlyTotalUsd,
  monthlyPerUsd,
  formatUsd,
  planHref,
} from '@/lib/constants/landing';
import { useAuth } from '@/hooks/useAuth';

const FEATURE_ICONS = {
  SINGLE: [Calendar, Clock],
  PACK_10: [Layers, Calendar],
  MONTHLY: [TrendingUp, RefreshCw],
} as const;

export interface SessionAwareCtaProps {
  /** `true` enquanto a sondagem de sessao (`GET /auth/me`) ainda esta em voo. */
  isLoading: boolean;
  /** Resultado da sondagem. So faz sentido quando `isLoading` e `false`. */
  isAuthenticated: boolean;
  /**
   * Monta o destino para um estado de sessao. E chamado DUAS vezes: com o
   * estado real (destino final) e com `false` (destino de visitante), que e o
   * href servido no HTML enquanto a sondagem nao responde.
   */
  buildHref: (isAuthenticated: boolean) => string;
  testId: string;
  /**
   * Classe COMPLETA do botao (`lp-btn lp-btn--...`). Antes o desenho vinha de
   * `buttonVariants` (Tailwind + shadcn); a landing agora e CSS puro
   * (`src/app/(public)/landing.css`), entao quem chama passa as classes
   * inteiras e nao existe variante implicita.
   */
  className: string;
  children: React.ReactNode;
}

/**
 * CTA da landing com os TRES estados da sondagem de sessao.
 *
 * `useAuth` comeca em `isLoading: true` e so entao decide entre visitante e
 * aluno logado. Enquanto isso `isAuthenticated` e `false`, entao ler so esse
 * booleano faz o CTA prometer `/auth/register` para quem ja esta logado.
 *
 * O estado de espera NAO pode virar botao morto: a landing e servida como
 * componente de servidor com `revalidate 3600`, entao o HTML sai do cache com o
 * primeiro estado renderizado. Sem JavaScript no navegador a hidratacao nunca
 * acontece, `isLoading` nunca cai e um botao desabilitado ficaria sem saida
 * para sempre. Por isso o CTA e SEMPRE um `<a>` de verdade: durante a espera
 * ele aponta para o funil publico (`buildHref(false)`), que leva a escolha de
 * plano junto e serve para qualquer visitante.
 *
 * Com JavaScript ativo o clique feito durante a espera nao segue o href de
 * visitante: e adiado (`preventDefault`) e o destino final e empurrado assim
 * que a sessao responde — o aluno logado vai para `/credits`, nao para o
 * cadastro. Cliques com modificador (nova aba, botao do meio) seguem o link
 * normalmente, porque nao da para adiar navegacao que o navegador abre sozinho.
 *
 * O rotulo de espera vem de `landing.pricing.cta_checking_session`, chave que ja
 * existe nos quatro idiomas e cujo texto e generico ("Verificando sua sessao"),
 * por isso serve tambem ao CTA do hero.
 */
export function SessionAwareCta({
  isLoading,
  isAuthenticated,
  buildHref,
  testId,
  className,
  children,
}: SessionAwareCtaProps) {
  const t = useTranslations('landing.pricing');
  const router = useRouter();
  // Ref, nao state: o clique adiado nao muda nada na tela (o spinner de espera
  // ja esta no ar desde que `isLoading` subiu) e guardar isso em state so
  // renderizaria de novo a toa. A re-renderizacao que faz o efeito rodar vem do
  // proprio `useAuth`, quando a sondagem responde e `isLoading` cai.
  const cliqueAdiado = useRef(false);

  const destinoFinal = buildHref(isAuthenticated);
  const href = isLoading ? buildHref(false) : destinoFinal;

  useEffect(() => {
    if (!cliqueAdiado.current || isLoading) return;
    cliqueAdiado.current = false;
    router.push(destinoFinal);
  }, [isLoading, destinoFinal, router]);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!isLoading || event.defaultPrevented) return;
    // Nova aba / nova janela / botao do meio: deixa o navegador levar o href de
    // visitante, que e um destino valido.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    cliqueAdiado.current = true;
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      data-testid={testId}
      data-state={isLoading ? 'loading' : 'ready'}
      aria-busy={isLoading ? 'true' : undefined}
      className={className}
    >
      {isLoading && <Loader2 className="lp-btn__spinner" aria-hidden="true" />}
      <span>{children}</span>
      {isLoading && (
        <span className="lp-sr-only" role="status">
          {t('cta_checking_session')}
        </span>
      )}
    </Link>
  );
}

export function PricingSection() {
  const t = useTranslations('landing.pricing');
  const locale = useLocale();
  const { isAuthenticated, isLoading } = useAuth();
  const [monthlyLessons, setMonthlyLessons] = useState<MonthlyLessons>(MONTHLY_OPTIONS[0].lessons);
  const monthlyTotal = monthlyTotalUsd(monthlyLessons);
  const monthlyPer = monthlyPerUsd(monthlyLessons);

  return (
    <section data-testid="landing-pricing" className="lp-pricing" id="precos" aria-labelledby="pricing-heading">
      <div className="lp-container">
        <div className="lp-pricing__banner">
          <p className="lp-pricing__banner-text">
            <Ticket />
            {t('discount_banner')}
          </p>
        </div>

        <h2 id="pricing-heading" className="lp-pricing__title">
          {t('title')}
        </h2>

        <div className="lp-pricing__grid">
          <article data-testid="landing-pricing-plan-single" className="lp-plan">
            <h3 className="lp-plan__name">{t('packages.single.name')}</h3>
            <span className="lp-rule lp-plan__rule lp-plan__rule--amber" />
            <p className="lp-plan__label lp-plan__label--first">{t('first_lesson_label')}</p>
            <p className="lp-plan__price-row">
              <span className="lp-plan__price">{formatUsd(FIRST_LESSON_USD, locale)}</span>
              <span className="lp-plan__price-old">{formatUsd(SINGLE_USD, locale)}</span>
            </p>
            <p className="lp-plan__label lp-plan__label--following">{t('following_lessons_label')}</p>
            <p className="lp-plan__price">{formatUsd(SINGLE_USD, locale)}</p>
            <p className="lp-plan__label lp-plan__label--tight">{t('per_lesson')}</p>
            <SessionAwareCta
              isLoading={isLoading}
              isAuthenticated={isAuthenticated}
              buildHref={(autenticado) => planHref(autenticado, 'SINGLE')}
              testId="landing-pricing-plan-single-cta-button"
              className="lp-btn lp-btn--outline lp-btn--block lp-plan__cta"
            >
              {t('packages.single.cta')}
            </SessionAwareCta>
            <ul className="lp-plan__features">
              {(t.raw('packages.single.features') as string[]).map((feat, i) => {
                const Icon = FEATURE_ICONS.SINGLE[i] ?? Calendar;
                return (
                  <li key={feat} className="lp-plan__feature">
                    <Icon />
                    {feat}
                  </li>
                );
              })}
            </ul>
          </article>

          <article
            data-testid="landing-pricing-plan-pack-10"
            className="lp-plan lp-plan--featured"
          >
            <div className="lp-plan__flag">
              <span className="lp-plan__flag-badge">
                <Star />
                {t('most_chosen')}
              </span>
            </div>
            <h3 className="lp-plan__name">{t('packages.pack10.name')}</h3>
            <span className="lp-rule lp-plan__rule" />
            <p className="lp-plan__price lp-plan__price--hero">{formatUsd(PACK10_USD, locale)}</p>
            <p className="lp-plan__label lp-plan__label--loose">{t('equivalent_to')}</p>
            <p className="lp-plan__price lp-plan__price--brand">
              {formatUsd(PACK10_PER, locale)}
              <span className="lp-plan__price-suffix">{t('per_lesson_suffix')}</span>
            </p>
            <SessionAwareCta
              isLoading={isLoading}
              isAuthenticated={isAuthenticated}
              buildHref={(autenticado) => planHref(autenticado, 'PACK_10')}
              testId="landing-pricing-plan-pack-10-cta-button"
              className="lp-btn lp-btn--primary lp-btn--block lp-plan__cta"
            >
              {t('packages.pack10.cta')}
            </SessionAwareCta>
            <ul className="lp-plan__features">
              {(t.raw('packages.pack10.features') as string[]).map((feat, i) => {
                const Icon = FEATURE_ICONS.PACK_10[i] ?? Layers;
                return (
                  <li key={feat} className="lp-plan__feature">
                    <Icon />
                    {feat}
                  </li>
                );
              })}
            </ul>
          </article>

          <article data-testid="landing-pricing-plan-monthly" className="lp-plan">
            <h3 className="lp-plan__name">{t('packages.monthly.name')}</h3>
            <span className="lp-rule lp-plan__rule lp-plan__rule--amber" />
            <div
              data-testid="landing-pricing-monthly-options"
              className="lp-plan__options"
              role="radiogroup"
              aria-label={t('packages.monthly.name')}
            >
              {MONTHLY_OPTIONS.map((option) => {
                const selected = monthlyLessons === option.lessons;
                return (
                  <button
                    key={option.lessons}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`landing-pricing-monthly-option-${option.lessons}`}
                    onClick={() => setMonthlyLessons(option.lessons)}
                    className={
                      selected
                        ? 'lp-plan__option lp-plan__option--selected'
                        : 'lp-plan__option'
                    }
                  >
                    <p className="lp-plan__option-title">
                      {option.lessons} {t('lessons_suffix')}
                    </p>
                    <p className="lp-plan__option-sub">
                      {formatUsd(option.per, locale)}
                      {t('per_lesson_suffix')}
                    </p>
                    {option.lessons === 20 && (
                      <p className="lp-plan__option-best">{t('best_cost')}</p>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="lp-plan__price lp-plan__price--hero">{formatUsd(monthlyTotal, locale)}</p>
            <p className="lp-plan__label lp-plan__label--loose">
              {t('per_month', { count: monthlyLessons })}
            </p>
            <p className="lp-plan__price lp-plan__price--amber">
              {formatUsd(monthlyPer, locale)}
              <span className="lp-plan__price-suffix">{t('per_lesson_suffix')}</span>
            </p>
            {monthlyLessons === 20 && <p className="lp-plan__best">{t('best_cost')}</p>}
            <SessionAwareCta
              isLoading={isLoading}
              isAuthenticated={isAuthenticated}
              buildHref={(autenticado) => planHref(autenticado, 'MONTHLY', monthlyLessons)}
              testId="landing-pricing-plan-monthly-cta-button"
              className="lp-btn lp-btn--outline lp-btn--block lp-plan__cta"
            >
              {t('packages.monthly.cta')}
            </SessionAwareCta>
            <ul className="lp-plan__features">
              {(t.raw('packages.monthly.features') as string[]).map((feat, i) => {
                const Icon = FEATURE_ICONS.MONTHLY[i] ?? TrendingUp;
                return (
                  <li key={feat} className="lp-plan__feature">
                    <Icon />
                    {feat}
                  </li>
                );
              })}
            </ul>
          </article>
        </div>
        <div className="lp-pricing__footnote-row">
          <span className="lp-pricing__footnote-line" />
          <p data-testid="landing-pricing-footnote" className="lp-pricing__footnote">
            {t('footnote_credits')}
            <span className="lp-pricing__footnote-dot">•</span>
            {t('footnote_cancel')}
          </p>
          <span className="lp-pricing__footnote-line" />
        </div>
      </div>
    </section>
  );
}
