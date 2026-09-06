import { describe, expect, it } from 'vitest';

import {
  FIRST_LESSON_USD,
  MONTHLY_OPTIONS,
  PACK10_USD,
  SINGLE_USD,
  monthlyTotalUsd,
} from '@/lib/constants/landing';
import { PRICING, monthlyPackageType, resolvePrice } from '@/lib/pricing/config';
import type { Currency } from '@/lib/currency';

/**
 * Trava de paridade landing <-> checkout.
 *
 * A landing (`src/lib/constants/landing.ts`) e a vitrine publica de preco; o
 * checkout cobra o que esta em `PRICING`. Se os dois divergirem, o aluno ve um
 * preco e paga outro. Este teste falha no CI antes disso chegar em producao.
 *
 * Ele tambem trava a segunda regra: a tabela de cambio vive SO em
 * `src/lib/pricing/config.ts`. Qualquer moeda derivada fora das taxas
 * documentadas (USDC 1:1, EUR 0,92x, BRL 5,0x, arredondando para cima) quebra
 * aqui em vez de virar cambio caseiro dentro de um componente.
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

describe('tabela de cambio unica em PRICING', () => {
  const packages = Object.keys(PRICING) as Array<keyof typeof PRICING>;
  const currencies: Currency[] = ['USD', 'USDC', 'EUR', 'BRL'];

  it.each(packages)('%s deriva todas as moedas do USD pelas taxas documentadas', (pkg) => {
    const usdCents = PRICING[pkg].USD.amountCents;
    for (const currency of currencies) {
      expect(PRICING[pkg][currency].amountCents).toBe(
        Math.ceil(usdCents * FX_FROM_USD[currency]),
      );
    }
  });
});
