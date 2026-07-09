import { describe, it, expect } from 'vitest';
import {
  resolveChargeCurrency,
  resolveFxSource,
  applyRounding,
  isFxRateStale,
  getRegionalDisplay,
  fxSourcePriority,
  DEFAULT_CHARGE_CURRENCY,
  FX_RATE_MAX_AGE_MS,
  type FxRateCandidate,
} from '@/lib/billing/currency-policy';

/**
 * Acceptance ADR-0006 / task-064 (T-063):
 * - moeda de registro resolvida por uma fonte unica (explicit -> locale -> default);
 * - cadeia de fallback FX deterministica e fail-loud quando esgotada;
 * - arredondamento HALF_UP estavel para inteiros e negativos;
 * - exibicao regional centralizada (admin e checkout consomem a mesma funcao).
 */
describe('currency-policy (ADR-0006)', () => {
  describe('resolveChargeCurrency §2', () => {
    it('prefere a escolha explicita suportada', () => {
      expect(resolveChargeCurrency({ explicit: 'eur', locale: 'pt-BR' })).toBe('EUR');
    });

    it('cai para o locale quando nao ha escolha explicita valida', () => {
      expect(resolveChargeCurrency({ explicit: 'XXX', locale: 'pt-BR' })).toBe('BRL');
    });

    it('cai para DEFAULT_CHARGE_CURRENCY sem explicit nem locale', () => {
      expect(resolveChargeCurrency()).toBe(DEFAULT_CHARGE_CURRENCY);
    });
  });

  describe('resolveFxSource §1 (cadeia de fallback)', () => {
    const now = new Date('2026-06-23T00:00:00Z');

    it('retorna a primeira fonte da prioridade que esteja fresca', () => {
      const candidates: FxRateCandidate[] = [
        { source: 'STRIPE', rate: 5.1, collectedAt: now },
        { source: 'OPEN_EXCHANGE_RATES', rate: 5.0, collectedAt: now },
      ];
      // FIAT priority: OPEN_EXCHANGE_RATES > STRIPE > SEED > MANUAL
      expect(resolveFxSource('BRL', candidates, now).source).toBe('OPEN_EXCHANGE_RATES');
    });

    it('pula fonte stale e usa o proximo elo da cadeia', () => {
      const stale = new Date(now.getTime() - FX_RATE_MAX_AGE_MS - 1);
      const candidates: FxRateCandidate[] = [
        { source: 'OPEN_EXCHANGE_RATES', rate: 5.0, collectedAt: stale },
        { source: 'STRIPE', rate: 5.1, collectedAt: now },
      ];
      expect(resolveFxSource('BRL', candidates, now).source).toBe('STRIPE');
    });

    it('lanca erro explicito quando a cadeia inteira esta esgotada (Zero Silencio)', () => {
      expect(() => resolveFxSource('BRL', [], now)).toThrow(/Nenhuma fonte FX valida/);
    });

    it('usa a cadeia CRYPTO para USDC', () => {
      expect(fxSourcePriority('USDC')[0]).toBe('COINGECKO');
    });
  });

  describe('applyRounding §3 (HALF_UP)', () => {
    it('e no-op para inteiros (cents)', () => {
      expect(applyRounding(1234, 'USD')).toBe(1234);
    });

    it('arredonda fracionario com HALF_UP', () => {
      expect(applyRounding(10.5, 'USD')).toBe(11);
    });

    it('preserva sinal de valores negativos (reembolsos)', () => {
      expect(applyRounding(-10.4, 'USD')).toBe(-10);
    });
  });

  describe('staleness', () => {
    const now = new Date('2026-06-23T00:00:00Z');

    it('trata datas futuras como stale', () => {
      const future = new Date(now.getTime() + 1000);
      expect(isFxRateStale(future, now)).toBe(true);
    });

    it('trata datas invalidas como stale', () => {
      expect(isFxRateStale(new Date('nope'), now)).toBe(true);
    });
  });

  describe('getRegionalDisplay §3 (fonte unica admin + checkout)', () => {
    it('arredonda e formata via a politica unica', () => {
      const out = getRegionalDisplay(1990, 'USD', 'en-US');
      expect(out.currency).toBe('USD');
      expect(out.amountMinor).toBe(1990);
      expect(typeof out.formatted).toBe('string');
      expect(out.formatted.length).toBeGreaterThan(0);
    });
  });
});
