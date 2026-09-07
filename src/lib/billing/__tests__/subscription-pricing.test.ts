import { describe, it, expect } from 'vitest';
import {
  FX_FROM_USD,
  PRICING,
  convertUsdCents,
  type PackageType,
} from '@/lib/pricing/config';
import {
  calculateMonthlyLessonsAmountCents,
  calculateSubscriptionMonthlyAmountCents,
  resolveSubscriptionMonthlyAmountCents,
} from '@/lib/billing/subscription-pricing';
import { SUPPORTED_CURRENCIES } from '@/lib/currency';
import type { Currency } from '@/lib/currency';

/**
 * Trava de FONTE UNICA de cambio.
 *
 * `subscription-pricing.ts` mantinha uma tabela `SUBSCRIPTION_FX` propria e
 * PRECIFICAVA com ela o eixo legado por cadencia semanal — cobranca real fora do
 * modulo canonico, exatamente o que `src/lib/billing/currency-policy.ts` (linha
 * 10) proibe. A suite continuava verde se o EUR divergisse ali, porque
 * `src/lib/pricing/__tests__/pricing-parity.test.ts` so inspeciona `PRICING`.
 *
 * Este arquivo fecha o buraco pelo outro lado: amarra a taxa exportada aos DOIS
 * caminhos de preco de assinatura (o mensal, que vem de `PRICING`, e o legado,
 * que e calculado) e ao catalogo inteiro. Trocar uma taxa em um lugar so passa a
 * quebrar aqui.
 */

/** Preco base do eixo legado: US$ 16/aula x 4,33 semanas/mes, em centavos USD. */
function legacyBaseUsdCents(weeklyFrequency: number): number {
  return Math.ceil(weeklyFrequency * 1600 * 4.33);
}

const PACKAGES = Object.keys(PRICING) as PackageType[];
const CURRENCIES = SUPPORTED_CURRENCIES as readonly Currency[];

describe('tabela de cambio unica', () => {
  it('cobre exatamente as moedas suportadas', () => {
    expect(Object.keys(FX_FROM_USD).sort()).toEqual([...CURRENCIES].sort());
  });

  it('trava as taxas publicadas no cabecalho de pricing/config.ts', () => {
    expect(FX_FROM_USD).toEqual({ USD: 1, USDC: 1, EUR: 0.92, BRL: 5 });
  });

  it('convertUsdCents arredonda para cima, como o catalogo', () => {
    // 2500 x 0,92 = 2300 exato; 1250 x 0,92 = 1150 exato; 1251 x 0,92 = 1150,92.
    expect(convertUsdCents(2500, 'EUR')).toBe(2300);
    expect(convertUsdCents(1251, 'EUR')).toBe(1151);
    expect(convertUsdCents(2500, 'USDC')).toBe(2500);
  });

  it('cada linha de PRICING e o USD convertido pela MESMA taxa', () => {
    for (const pkg of PACKAGES) {
      const usdCents = PRICING[pkg].USD.amountCents;
      for (const currency of CURRENCIES) {
        expect({ pkg, currency, cents: PRICING[pkg][currency].amountCents }).toEqual({
          pkg,
          currency,
          cents: convertUsdCents(usdCents, currency),
        });
      }
    }
  });
});

describe('eixo LEGADO por cadencia semanal', () => {
  it('converte pela tabela unica, sem taxa propria', () => {
    for (const weeklyFrequency of [1, 2, 3, 4, 5]) {
      const baseUsdCents = legacyBaseUsdCents(weeklyFrequency);
      expect(calculateSubscriptionMonthlyAmountCents(weeklyFrequency, 'USD')).toBe(baseUsdCents);

      for (const currency of CURRENCIES) {
        expect({ weeklyFrequency, currency, cents: calculateSubscriptionMonthlyAmountCents(weeklyFrequency, currency) }).toEqual({
          weeklyFrequency,
          currency,
          cents: convertUsdCents(baseUsdCents, currency),
        });
      }
    }
  });

  it('EUR e BRL do plano legado saem da taxa canonica, nao de uma copia local', () => {
    // 2 aulas/semana: ceil(2 x 1600 x 4,33) = 13856 centavos USD.
    expect(calculateSubscriptionMonthlyAmountCents(2, 'USD')).toBe(13856);
    expect(calculateSubscriptionMonthlyAmountCents(2, 'EUR')).toBe(Math.ceil(13856 * FX_FROM_USD.EUR));
    expect(calculateSubscriptionMonthlyAmountCents(2, 'BRL')).toBe(Math.ceil(13856 * FX_FROM_USD.BRL));
  });
});

describe('eixo CANONICO por volume mensal', () => {
  it('espelha PRICING nas quatro moedas', () => {
    for (const currency of CURRENCIES) {
      expect(calculateMonthlyLessonsAmountCents(10, currency)).toBe(
        PRICING.MONTHLY_10[currency].amountCents,
      );
      expect(calculateMonthlyLessonsAmountCents(20, currency)).toBe(
        PRICING.MONTHLY_20[currency].amountCents,
      );
    }
  });
});

describe('resolveSubscriptionMonthlyAmountCents - eixo persistido', () => {
  it('monthlyLessons vence o eixo legado e respeita a moeda de cobranca', () => {
    expect(
      resolveSubscriptionMonthlyAmountCents({ monthlyLessons: 10, weeklyFrequency: 2 }, 'EUR'),
    ).toBe(PRICING.MONTHLY_10.EUR.amountCents);
  });

  it('sem monthlyLessons cai no eixo legado, tambem na moeda pedida', () => {
    expect(
      resolveSubscriptionMonthlyAmountCents({ monthlyLessons: null, weeklyFrequency: 2 }, 'BRL'),
    ).toBe(convertUsdCents(legacyBaseUsdCents(2), 'BRL'));
  });
});
