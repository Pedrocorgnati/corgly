import { describe, expect, it } from 'vitest';

import {
  FIRST_LESSON_USD,
  MONTHLY_OPTIONS,
  PACK10_PER,
  PACK10_USD,
  SINGLE_USD,
  monthlyTotalUsd,
} from '@/lib/constants/landing';
import { PRICING, monthlyPackageType, resolvePrice } from '@/lib/pricing/config';
import type { PackageType } from '@/lib/pricing/config';
import * as stripePriceConstants from '@/lib/constants/stripe-prices';
import { PACKAGE_CREDITS } from '@/lib/constants/stripe-prices';
import type { Currency } from '@/lib/currency';

/**
 * Trava de paridade landing <-> checkout.
 *
 * A landing (`src/lib/constants/landing.ts`) e a vitrine publica de preco; o
 * checkout cobra o que esta em `PRICING`. Se os dois divergirem, o aluno ve um
 * preco e paga outro. Este teste falha no CI antes disso chegar em producao.
 *
 * Sao TRES travas, nao uma:
 *  1. TOTAL por pacote (o numero grande do card);
 *  2. VALOR POR AULA (o "US$ X por aula" impresso ao lado do total, derivado do
 *     total dividido pela quantidade de aulas que o pacote realmente concede);
 *  3. CAMBIO por pacote e por moeda — a tabela de cambio vive SO em
 *     `src/lib/pricing/config.ts` (USDC 1:1, EUR 0,92x, BRL 5,0x, arredondando
 *     para cima). Moeda digitada errada quebra aqui, nomeando pacote e moeda,
 *     em vez de virar cambio caseiro dentro de um componente.
 */

/** USD -> centavos inteiros, sem depender de float residual. */
function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}

/** Taxas documentadas em `PRICING`. USD e a moeda base. */
const FX_FROM_USD: Record<Currency, number> = {
  USD: 1,
  USDC: 1,
  EUR: 0.92,
  BRL: 5,
};

const CURRENCIES: Currency[] = ['USD', 'USDC', 'EUR', 'BRL'];

/**
 * Preco USD publicado na vitrine, por pacote. E a ancora de TODAS as moedas
 * destes pacotes: a conversao e conferida contra o numero da landing, nao contra
 * o proprio USD de `PRICING` (que poderia estar errado junto).
 *
 * PACK_5 nao aparece porque saiu da vitrine — ele continua coberto pela trava de
 * cambio interna mais abaixo.
 */
const LANDING_USD_BY_PACKAGE: Partial<Record<PackageType, number>> = {
  SINGLE: SINGLE_USD,
  PACK_10: PACK10_USD,
  PROMO: FIRST_LESSON_USD,
  MONTHLY_10: monthlyTotalUsd(10),
  MONTHLY_20: monthlyTotalUsd(20),
};

describe('paridade de preco landing <-> PRICING (USD)', () => {
  it('SINGLE cobra o preco da aula avulsa da landing', () => {
    expect(PRICING.SINGLE.USD.amountCents).toBe(usdToCents(SINGLE_USD));
  });

  it('PACK_10 cobra o preco do pacote de 10 aulas da landing', () => {
    expect(PRICING.PACK_10.USD.amountCents).toBe(usdToCents(PACK10_USD));
  });

  it('PROMO cobra o preco da primeira aula da landing', () => {
    expect(PRICING.PROMO.USD.amountCents).toBe(usdToCents(FIRST_LESSON_USD));
  });

  it('MONTHLY_10 cobra o total mensal de 10 aulas da landing', () => {
    expect(PRICING.MONTHLY_10.USD.amountCents).toBe(usdToCents(monthlyTotalUsd(10)));
  });

  it('MONTHLY_20 cobra o total mensal de 20 aulas da landing', () => {
    expect(PRICING.MONTHLY_20.USD.amountCents).toBe(usdToCents(monthlyTotalUsd(20)));
  });

  it('toda opcao mensal publicada na landing tem pacote correspondente em PRICING', () => {
    for (const option of MONTHLY_OPTIONS) {
      const pkg = monthlyPackageType(option.lessons);
      expect(resolvePrice(pkg, 'USD').amountCents).toBe(
        usdToCents(option.lessons * option.per),
      );
    }
  });
});

/**
 * O valor por aula e afirmacao de vitrine tanto quanto o total: os cards
 * imprimem "US$ 19 por aula", "US$ 17 por aula", "US$ 15 por aula". Antes nada
 * conferia esses numeros contra o que e cobrado — `PACK10_PER` podia virar 18 e
 * o card anunciaria 10 aulas por US$ 190 "a US$ 18 cada" sem ninguem reclamar.
 *
 * O divisor NAO e um literal: e a quantidade de creditos que o pacote realmente
 * concede (`PACKAGE_CREDITS`, o mesmo mapa que o webhook usa para creditar) ou o
 * volume mensal contratado. Assim a promessa por aula fica amarrada ao que o
 * aluno de fato recebe.
 */
describe('paridade de valor por aula landing <-> PRICING (USD)', () => {
  it('SINGLE: a aula avulsa concede 1 credito pelo preco anunciado', () => {
    expect(PRICING.SINGLE.USD.amountCents).toBe(usdToCents(SINGLE_USD) * PACKAGE_CREDITS.SINGLE);
  });

  it('PROMO: a primeira aula concede 1 credito pelo preco anunciado', () => {
    expect(PRICING.PROMO.USD.amountCents).toBe(
      usdToCents(FIRST_LESSON_USD) * PACKAGE_CREDITS.PROMO,
    );
  });

  it('PACK_10: total = PACK10_PER x creditos concedidos pelo pacote', () => {
    expect(PRICING.PACK_10.USD.amountCents).toBe(usdToCents(PACK10_PER) * PACKAGE_CREDITS.PACK_10);
  });

  it.each(MONTHLY_OPTIONS)(
    'MONTHLY de $lessons aulas: total = $per x aulas do plano',
    (option) => {
      const pkg = monthlyPackageType(option.lessons);
      expect(resolvePrice(pkg, 'USD').amountCents).toBe(usdToCents(option.per) * option.lessons);
    },
  );
});

describe('tabela de cambio unica em PRICING', () => {
  const publishedPackages = Object.keys(LANDING_USD_BY_PACKAGE) as PackageType[];
  const publishedPairs = publishedPackages.flatMap((pkg) =>
    CURRENCIES.map((currency) => [pkg, currency] as const),
  );

  it.each(publishedPairs)(
    '%s em %s converte o preco da landing pela taxa documentada',
    (pkg, currency) => {
      const landingUsd = LANDING_USD_BY_PACKAGE[pkg];
      expect(landingUsd).toBeDefined();
      expect(PRICING[pkg][currency].amountCents).toBe(
        Math.ceil(usdToCents(landingUsd as number) * FX_FROM_USD[currency]),
      );
    },
  );

  const allPairs = (Object.keys(PRICING) as PackageType[]).flatMap((pkg) =>
    CURRENCIES.map((currency) => [pkg, currency] as const),
  );

  it.each(allPairs)('%s em %s deriva do proprio USD pela taxa documentada', (pkg, currency) => {
    expect(PRICING[pkg][currency].amountCents).toBe(
      Math.ceil(PRICING[pkg].USD.amountCents * FX_FROM_USD[currency]),
    );
  });
});

/**
 * Preco mora em UM lugar so. `src/lib/constants/stripe-prices.ts` chegou a
 * publicar um `PACKAGE_PRICES` em centavos USD — uma terceira tabela, sem
 * consumidor, envelhecendo em silencio ate alguem adota-la por engano. Ela foi
 * removida; este teste impede a volta.
 */
describe('fonte unica de preco', () => {
  it('stripe-prices.ts publica credito e rotulo, nunca preco', () => {
    expect(stripePriceConstants).toHaveProperty('PACKAGE_CREDITS');
    expect(stripePriceConstants).toHaveProperty('PACKAGE_LABELS');
    expect(stripePriceConstants).not.toHaveProperty('PACKAGE_PRICES');
  });
});
