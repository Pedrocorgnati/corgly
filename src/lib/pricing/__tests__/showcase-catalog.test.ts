import { describe, expect, it } from 'vitest';

import {
  MONTHLY_OPTIONS,
  monthlyTotalUsd,
  planHref,
  planSelectionFromParams,
  planSelectionQuery,
  type LandingPlanId,
} from '@/lib/constants/landing';
import { ROUTES } from '@/lib/constants/routes';
import { PRICING, monthlyPackageType, resolvePrice } from '@/lib/pricing/config';
import { PACKAGE_CREDITS } from '@/lib/constants/stripe-prices';
import {
  CreateCheckoutSchema,
  CreateSubscriptionCheckoutSchema,
  MonthlyLessonsEnum,
} from '@/schemas/checkout.schema';
import {
  LEGACY_WEEKS_PER_MONTH_CREDITS,
  resolveMonthlyCredits,
} from '@/lib/billing/subscription-pricing';

/**
 * Contrato da VITRINE (landing publica e /credits do dashboard).
 *
 * `pricing-parity.test.ts` ao lado trava o NUMERO cobrado. Este arquivo trava o
 * CATALOGO e as PORTAS: quais planos existem na vitrine, quem consegue escolher
 * o preco promocional, qual eixo precifica a assinatura e se a escolha feita na
 * landing sobrevive ate a vitrine do dashboard.
 *
 * Sao defeitos que preco correto nao impede: um card que oferece um plano que o
 * checkout recusa, uma URL que injeta o preco de primeira aula em quem ja
 * comprou, um volume mensal que chega ao servidor e sai como outro numero de
 * creditos.
 */

/** Planos publicados na vitrine. PACK_5 saiu; PROMO nunca foi escolhivel. */
const SHOWCASE_PLANS: readonly LandingPlanId[] = ['SINGLE', 'PACK_10', 'MONTHLY'];

describe('catalogo da vitrine', () => {
  it.each(SHOWCASE_PLANS)('%s e um plano valido do contrato de URL', (plan) => {
    expect(planSelectionFromParams(plan)).toEqual(expect.objectContaining({ plan }));
  });

  it('PACK_5 saiu da vitrine: nao e escolhivel por URL', () => {
    expect(planSelectionFromParams('PACK_5')).toBeNull();
  });

  it('PACK_5 continua vivo no backend para nao quebrar compras antigas', () => {
    expect(PRICING.PACK_5).toBeDefined();
    expect(PRICING.PACK_5.USD.amountCents).toBeGreaterThan(0);
    expect(PACKAGE_CREDITS.PACK_5).toBe(5);
    expect(CreateCheckoutSchema.safeParse({ packageType: 'PACK_5' }).success).toBe(true);
  });

  it('todo plano da vitrine resolve preco nas quatro moedas', () => {
    const packages = SHOWCASE_PLANS.map((plan) =>
      plan === 'MONTHLY' ? monthlyPackageType(MONTHLY_OPTIONS[0].lessons) : plan,
    );
    for (const pkg of packages) {
      for (const currency of ['USD', 'USDC', 'EUR', 'BRL'] as const) {
        expect(resolvePrice(pkg, currency).amountCents).toBeGreaterThan(0);
      }
    }
  });

  it('plano desconhecido nao vira selecao silenciosa', () => {
    expect(planSelectionFromParams('PACK_100')).toBeNull();
    expect(planSelectionFromParams('')).toBeNull();
    expect(planSelectionFromParams(undefined)).toBeNull();
    expect(planSelectionFromParams(42)).toBeNull();
  });
});

/**
 * O preco de primeira aula (PROMO, US$ 12,50) e concedido pelo SERVIDOR, que
 * relê `isFirstPurchase` do banco (`src/app/api/v1/checkout/route.ts:64-66` ->
 * `checkout.service.ts:58`). O cliente nao tem porta para pedi-lo: nem pela URL
 * da vitrine, nem pelo corpo do checkout.
 */
describe('PROMO nao e escolhivel pelo cliente', () => {
  it('?plan=PROMO nao preseleciona plano nenhum', () => {
    expect(planSelectionFromParams('PROMO')).toBeNull();
    expect(planSelectionFromParams('promo')).toBeNull();
  });

  it('o checkout avulso recusa packageType PROMO', () => {
    expect(CreateCheckoutSchema.safeParse({ packageType: 'PROMO' }).success).toBe(false);
  });

  it('o checkout avulso recusa pacote de assinatura no eixo de compra unica', () => {
    expect(CreateCheckoutSchema.safeParse({ packageType: 'MONTHLY_10' }).success).toBe(false);
    expect(CreateCheckoutSchema.safeParse({ packageType: 'MONTHLY_20' }).success).toBe(false);
  });

  it('PROMO concede o mesmo credito da aula avulsa: e desconto, nao outro produto', () => {
    expect(PACKAGE_CREDITS.PROMO).toBe(PACKAGE_CREDITS.SINGLE);
  });
});

/**
 * Eixo canonico da assinatura: `monthlyLessons` (10 ou 20). `weeklyFrequency`
 * (1..5) e legado e continua servido — ha cobranca viva nele.
 */
describe('eixo de assinatura', () => {
  it.each(MONTHLY_OPTIONS)(
    'o volume de $lessons aulas publicado na landing e aceito pelo schema',
    (option) => {
      expect(MonthlyLessonsEnum.safeParse(option.lessons).success).toBe(true);
      expect(
        CreateSubscriptionCheckoutSchema.safeParse({ monthlyLessons: option.lessons }).success,
      ).toBe(true);
    },
  );

  it('volume fora do catalogo nao vira cobranca inventada', () => {
    expect(CreateSubscriptionCheckoutSchema.safeParse({ monthlyLessons: 15 }).success).toBe(false);
  });

  it('os dois eixos juntos deixariam o preco ambiguo e sao recusados', () => {
    expect(
      CreateSubscriptionCheckoutSchema.safeParse({ monthlyLessons: 10, weeklyFrequency: 2 })
        .success,
    ).toBe(false);
  });

  it('assinatura sem eixo nenhum nao tem preco e e recusada', () => {
    expect(CreateSubscriptionCheckoutSchema.safeParse({ currency: 'USD' }).success).toBe(false);
  });

  it('o eixo legado por cadencia semanal continua aceito', () => {
    expect(CreateSubscriptionCheckoutSchema.safeParse({ weeklyFrequency: 3 }).success).toBe(true);
  });

  it.each(MONTHLY_OPTIONS)(
    'o plano de $lessons aulas concede exatamente as $lessons aulas anunciadas',
    (option) => {
      expect(
        resolveMonthlyCredits({ monthlyLessons: option.lessons, weeklyFrequency: 1 }),
      ).toBe(option.lessons);
    },
  );

  it('sem eixo canonico o credito cai na regra legada (cadencia x 4 semanas)', () => {
    expect(resolveMonthlyCredits({ weeklyFrequency: 3 })).toBe(3 * LEGACY_WEEKS_PER_MONTH_CREDITS);
    expect(resolveMonthlyCredits({ monthlyLessons: null, weeklyFrequency: 2 })).toBe(
      2 * LEGACY_WEEKS_PER_MONTH_CREDITS,
    );
  });

  it.each(MONTHLY_OPTIONS)(
    'o total mensal de $lessons aulas continua o publicado na landing',
    (option) => {
      expect(monthlyTotalUsd(option.lessons)).toBe(option.lessons * option.per);
    },
  );
});

/**
 * Ida e volta da escolha do visitante: quem monta a URL na landing (`planHref`)
 * e quem a le do outro lado (`planSelectionFromParams`) tem de concordar. Elas
 * ja divergiram — a vitrine tinha parser proprio e aceitava `?plan=SINGLE&
 * lessons=20`, plano avulso com volume mensal.
 */
describe('ida e volta da escolha de plano', () => {
  function parse(href: string): { path: string; selection: ReturnType<typeof planSelectionFromParams> } {
    const url = new URL(href, 'https://corgly.app');
    return {
      path: url.pathname,
      selection: planSelectionFromParams(
        url.searchParams.get('plan'),
        url.searchParams.get('lessons'),
      ),
    };
  }

  it.each(SHOWCASE_PLANS)('autenticado: %s chega intacto na vitrine do dashboard', (plan) => {
    const { path, selection } = parse(planHref(true, plan));
    expect(path).toBe(ROUTES.CREDITS);
    expect(selection).toEqual({ plan });
  });

  it.each(SHOWCASE_PLANS)('visitante: %s chega intacto no cadastro', (plan) => {
    const href = planHref(false, plan);
    const { path, selection } = parse(href);
    expect(path).toBe(ROUTES.REGISTER);
    expect(selection).toEqual({ plan });
    // O `intent` legado continua emitido para nao quebrar quem ainda o le.
    expect(new URL(href, 'https://corgly.app').searchParams.get('intent')).toBe('first-lesson');
  });

  it.each(MONTHLY_OPTIONS)('o volume mensal de $lessons aulas sobrevive a travessia', (option) => {
    expect(parse(planHref(true, 'MONTHLY', option.lessons)).selection).toEqual({
      plan: 'MONTHLY',
      monthlyLessons: option.lessons,
    });
    expect(parse(planHref(false, 'MONTHLY', option.lessons)).selection).toEqual({
      plan: 'MONTHLY',
      monthlyLessons: option.lessons,
    });
  });

  it('volume mensal nao gruda em plano avulso', () => {
    expect(planSelectionQuery({ plan: 'SINGLE', monthlyLessons: 20 })).toBe('plan=SINGLE');
    expect(planSelectionFromParams('SINGLE', '20')).toEqual({ plan: 'SINGLE' });
  });

  it('volume invalido nao invalida o plano: cai no volume padrao da vitrine', () => {
    expect(planSelectionFromParams('MONTHLY', '7')).toEqual({ plan: 'MONTHLY' });
    expect(planSelectionFromParams('MONTHLY')).toEqual({ plan: 'MONTHLY' });
  });
});
