/**
 * Politica unica de moeda, FX e exibicao regional (ADR-0006, §12.4.5).
 *
 * Fonte de verdade compartilhada por admin e checkout. Define:
 *  - fonte/atualizacao/fallback da taxa de cambio;
 *  - resolucao da moeda real de cobranca (moeda de registro);
 *  - arredondamento de unidades menores;
 *  - exibicao regional localizada.
 *
 * Proibido reimplementar qualquer uma dessas regras fora deste modulo.
 * O FX preview (`calculateFxPreview` em `fx.schema.ts`) permanece display-only
 * e NUNCA define o valor cobrado.
 */

import {
  type Currency,
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  localeToCurrency,
  formatPrice,
} from '@/lib/currency';
import {
  type FxRateSource,
  type FxRoundingPolicy,
  type FxPreview,
  type FxPreviewInput,
  calculateFxPreview,
} from '@/lib/billing/fx.schema';
import { FX_FROM_USD } from '@/lib/pricing/config';

/**
 * Moeda de cobranca de registro padrao quando nada mais resolve.
 * Decisao ADR-0006: fallback final e USD.
 */
export const DEFAULT_CHARGE_CURRENCY: Currency = 'USD';

/**
 * Cadencia de atualizacao da taxa FX: 24h.
 * Idade maxima tolerada antes de tratar a taxa como stale: 48h.
 */
export const FX_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const FX_RATE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * Cadeia de fallback deterministica por classe de moeda (ADR-0006 §1).
 * O primeiro elo com taxa disponivel e nao vencida vence.
 */
export const FX_SOURCE_PRIORITY: Record<'FIAT' | 'CRYPTO', readonly FxRateSource[]> = {
  FIAT: ['OPEN_EXCHANGE_RATES', 'STRIPE', 'SEED', 'MANUAL'],
  CRYPTO: ['COINGECKO', 'STRIPE', 'SEED', 'MANUAL'],
} as const;

/** Moedas cripto tratadas pela cadeia CRYPTO. Demais sao FIAT. */
const CRYPTO_CURRENCIES: readonly Currency[] = ['USDC'];

/**
 * Politica aplicada a moeda cuja unidade menor tem 2 casas decimais (centavo,
 * centesimo de euro, centavo de real). Consistente com o default de
 * `fx.schema.ts`.
 */
export const DEFAULT_ROUNDING_POLICY: FxRoundingPolicy = 'HALF_UP';

/**
 * Politica de arredondamento DECLARADA moeda a moeda (ADR-0006 §3).
 *
 * `Record<Currency, ...>` de proposito: acrescentar uma moeda a
 * `SUPPORTED_CURRENCIES` quebra a compilacao aqui ate que alguem declare a
 * politica dela. E o que faltava — antes existia so um parametro `_currency`
 * ignorado, ou seja, uma promessa de politica por moeda que o codigo nao
 * cumpria e que nenhuma moeda nova era obrigada a responder.
 *
 * As quatro moedas suportadas hoje declaram HALF_UP porque as quatro tem
 * unidade menor de 2 casas (USD/USDC em centavos, EUR em centesimos, BRL em
 * centavos): nao ha divergencia real a inventar. Moeda de unidade menor
 * diferente (JPY, zero casas, por exemplo) entra aqui com a SUA politica, e o
 * compilador cobra isso.
 */
export const ROUNDING_POLICY_BY_CURRENCY: Record<Currency, FxRoundingPolicy> = {
  USD: DEFAULT_ROUNDING_POLICY,
  USDC: DEFAULT_ROUNDING_POLICY,
  EUR: DEFAULT_ROUNDING_POLICY,
  BRL: DEFAULT_ROUNDING_POLICY,
};

export interface ResolveChargeCurrencyOptions {
  /** Moeda escolhida explicitamente pelo usuario, se houver. */
  explicit?: string | null;
  /** Locale do usuario (ex.: 'pt-BR'), usado quando nao ha escolha explicita. */
  locale?: string | null;
}

/**
 * Resolve a moeda de cobranca de registro (ADR-0006 §2).
 * Ordem: escolha explicita suportada -> locale -> DEFAULT_CHARGE_CURRENCY.
 *
 * Deve ser chamada UMA vez no checkout; o resultado e persistido junto da
 * cobranca e nao muda depois.
 */
export function resolveChargeCurrency(opts: ResolveChargeCurrencyOptions = {}): Currency {
  const explicit = opts.explicit?.toUpperCase();
  if (explicit && isSupportedCurrency(explicit)) {
    return explicit;
  }
  if (opts.locale) {
    return localeToCurrency(opts.locale);
  }
  return DEFAULT_CHARGE_CURRENCY;
}

/** Classe de cadeia FX (FIAT|CRYPTO) de uma moeda. */
export function fxSourceClass(currency: Currency): 'FIAT' | 'CRYPTO' {
  return CRYPTO_CURRENCIES.includes(currency) ? 'CRYPTO' : 'FIAT';
}

/** Cadeia de fallback ordenada para a moeda informada. */
export function fxSourcePriority(currency: Currency): readonly FxRateSource[] {
  return FX_SOURCE_PRIORITY[fxSourceClass(currency)];
}

/** Taxa FX candidata, indexada por fonte, para resolucao da cadeia de fallback. */
export interface FxRateCandidate {
  source: FxRateSource;
  rate: number;
  collectedAt: Date;
}

/**
 * Executa a cadeia de fallback (ADR-0006 §1): percorre `fxSourcePriority` na
 * ordem e retorna a PRIMEIRA candidata cuja fonte corresponde e que NAO esta
 * stale. Se nenhuma fonte da cadeia (inclusive MANUAL) tiver taxa valida,
 * lanca erro explicito - nunca cai em fallback silencioso (Zero Silencio).
 */
export function resolveFxSource(
  currency: Currency,
  candidates: readonly FxRateCandidate[],
  now: Date = new Date(),
): FxRateCandidate {
  const priority = fxSourcePriority(currency);
  for (const source of priority) {
    const candidate = candidates.find((c) => c.source === source);
    if (candidate && !isFxRateStale(candidate.collectedAt, now)) {
      return candidate;
    }
  }
  throw new Error(
    `Nenhuma fonte FX valida para ${currency}: cadeia [${priority.join(', ')}] esgotada (todas ausentes ou stale)`,
  );
}

/**
 * Politica de arredondamento da moeda, lida da tabela declarada acima
 * (ADR-0006 §3). O argumento e de fato consultado: nao existe mais politica
 * unica disfarcada de parametro.
 */
export function getRoundingPolicy(currency: Currency): FxRoundingPolicy {
  return ROUNDING_POLICY_BY_CURRENCY[currency];
}

/**
 * Taxa do elo SEED da cadeia de fallback, para o par `base -> quote`.
 *
 * Le a UNICA tabela de cambio do produto (`FX_FROM_USD`, em
 * `src/lib/pricing/config.ts`) — a mesma que derivou cada linha de `PRICING`.
 * Existe porque a rota de preview mantinha uma SEGUNDA tabela com exatamente os
 * mesmos numeros: duas tabelas identicas divergem no dia em que alguem atualiza
 * uma so, e o topo deste arquivo proibe reimplementar cambio fora daqui.
 *
 * Taxa cruzada = cotacao do alvo / cotacao da origem, ambas em base USD
 * (`FX_FROM_USD.USD === 1`, entao os pares com USD caem no caso geral).
 * Cotacao ausente ou nao positiva estoura em vez de devolver `Infinity`,
 * `NaN` ou zero disfarcados de taxa (Zero Silencio).
 */
export function seedFxRate(base: Currency, quote: Currency): number {
  const baseRate = FX_FROM_USD[base];
  const quoteRate = FX_FROM_USD[quote];
  if (!(baseRate > 0) || !(quoteRate > 0)) {
    throw new Error(
      `Taxa SEED indisponivel para ${base}->${quote}: FX_FROM_USD tem ${base}=${baseRate}, ${quote}=${quoteRate}`,
    );
  }
  return quoteRate / baseRate;
}

/**
 * Indica se uma taxa FX coletada em `collectedAt` esta stale.
 * Datas invalidas (NaN) ou futuras sao tratadas como stale explicitamente,
 * nunca silenciosamente aceitas como frescas.
 */
export function isFxRateStale(collectedAt: Date, now: Date = new Date()): boolean {
  const collectedMs = collectedAt.getTime();
  const nowMs = now.getTime();
  if (Number.isNaN(collectedMs)) return true;
  if (collectedMs > nowMs) return true;
  return nowMs - collectedMs > FX_RATE_MAX_AGE_MS;
}

/**
 * Arredonda valor (em unidades menores fracionarias) para inteiro conforme a
 * politica da moeda. Espelha a logica de fx.schema.ts para manter paridade.
 *
 * Momento de chamada na pipeline (ADR-0006 §3): apos a conversao FX (ex.:
 * `subscription-pricing.ts` aplicando a taxa) e ANTES de persistir
 * `charge.amountMinor`. Valores negativos (reembolsos, creditos) sao
 * suportados: o sinal e preservado e a politica e aplicada sobre o modulo.
 */
export function applyRounding(valueMinor: number, currency: Currency): number {
  const policy = getRoundingPolicy(currency);
  switch (policy) {
    case 'FLOOR':
      return Math.floor(valueMinor);
    case 'CEIL':
      return Math.ceil(valueMinor);
    case 'HALF_EVEN': {
      // Arredonda sobre o valor absoluto e restaura o sinal para tratar
      // negativos (reembolsos/creditos) de forma simetrica.
      const sign = valueMinor < 0 ? -1 : 1;
      const abs = Math.abs(valueMinor);
      const floor = Math.floor(abs);
      const diff = abs - floor;
      let roundedAbs: number;
      if (diff < 0.5) roundedAbs = floor;
      else if (diff > 0.5) roundedAbs = floor + 1;
      else roundedAbs = floor % 2 === 0 ? floor : floor + 1;
      return sign * roundedAbs;
    }
    case 'HALF_UP':
    default:
      return Math.round(valueMinor);
  }
}

export interface RegionalDisplay {
  currency: Currency;
  amountMinor: number;
  formatted: string;
}

/**
 * Exibicao regional centralizada (ADR-0006 §3). Admin e checkout chamam ESTA
 * funcao; nunca formatam moeda por conta propria.
 */
export function getRegionalDisplay(
  amountMinor: number,
  currency: Currency,
  locale: string,
): RegionalDisplay {
  const rounded = applyRounding(amountMinor, currency);
  return {
    currency,
    amountMinor: rounded,
    formatted: formatPrice(rounded, currency, locale),
  };
}

/**
 * Wrapper display-only sobre `calculateFxPreview` (ADR-0006 §2). Reforca por
 * construcao que o preview e exibicao: o valor retornado NUNCA deve ser usado
 * como `charge.amountMinor`. Admin e checkout devem consumir o preview por aqui;
 * o valor cobrado vem sempre da moeda de registro resolvida em
 * `resolveChargeCurrency`, nao deste preview.
 */
export function displayFxPreview(input: FxPreviewInput): FxPreview {
  return calculateFxPreview(input);
}

/** Moedas suportadas, reexportadas para conveniencia dos consumidores. */
export { SUPPORTED_CURRENCIES };
export type { Currency, FxPreview, FxPreviewInput };
