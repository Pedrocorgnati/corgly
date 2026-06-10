import { z } from 'zod';

/**
 * FX multi-moeda (§12.4.2 / §12.4.4).
 * O preview e puro: calcula valores para exibicao sem criar ou alterar cobranca.
 */

export const CURRENCY_CODES = ['USD', 'BRL', 'EUR', 'USDC'] as const;
export const FX_RATE_SOURCES = ['MANUAL', 'STRIPE', 'OPEN_EXCHANGE_RATES', 'COINGECKO', 'SEED'] as const;
export const FX_ROUNDING_POLICIES = ['HALF_UP', 'HALF_EVEN', 'FLOOR', 'CEIL'] as const;

export const currencyCodeSchema = z.enum(CURRENCY_CODES);
export const fxRateSourceSchema = z.enum(FX_RATE_SOURCES);
export const fxRoundingPolicySchema = z.enum(FX_ROUNDING_POLICIES);

export const fxRateSchema = z
  .object({
    baseCurrency: currencyCodeSchema.default('USD'),
    quoteCurrency: currencyCodeSchema,
    rate: z.coerce.number().positive('Taxa FX deve ser positiva'),
    source: fxRateSourceSchema,
    roundingPolicy: fxRoundingPolicySchema.default('HALF_UP'),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date().optional(),
    collectedAt: z.coerce.date(),
  })
  .superRefine((data, ctx) => {
    if (data.validUntil && data.validUntil <= data.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validUntil'],
        message: 'validUntil deve ser posterior a validFrom',
      });
    }
  });

export const fxPreviewInputSchema = z.object({
  amountMinor: z.coerce.number().int().nonnegative('Valor deve estar em unidades menores'),
  baseCurrency: currencyCodeSchema.default('USD'),
  quoteCurrency: currencyCodeSchema,
  rate: z.coerce.number().positive('Taxa FX deve ser positiva'),
  source: fxRateSourceSchema,
  roundingPolicy: fxRoundingPolicySchema.default('HALF_UP'),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().optional(),
  quotedAt: z.coerce.date().default(() => new Date()),
});

function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;

  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;

  return floor % 2 === 0 ? floor : floor + 1;
}

function roundMinor(value: number, policy: FxRoundingPolicy): number {
  switch (policy) {
    case 'FLOOR':
      return Math.floor(value);
    case 'CEIL':
      return Math.ceil(value);
    case 'HALF_EVEN':
      return roundHalfEven(value);
    case 'HALF_UP':
    default:
      return Math.round(value);
  }
}

export function calculateFxPreview(input: FxPreviewInput): FxPreview {
  const parsed = fxPreviewInputSchema.parse(input);

  if (parsed.quotedAt < parsed.validFrom || (parsed.validUntil && parsed.quotedAt >= parsed.validUntil)) {
    throw new Error('Taxa FX fora da janela de validade');
  }

  const convertedMinor = roundMinor(parsed.amountMinor * parsed.rate, parsed.roundingPolicy);

  return {
    baseAmountMinor: parsed.amountMinor,
    baseCurrency: parsed.baseCurrency,
    quoteAmountMinor: convertedMinor,
    quoteCurrency: parsed.quoteCurrency,
    rate: parsed.rate,
    source: parsed.source,
    roundingPolicy: parsed.roundingPolicy,
    quotedAt: parsed.quotedAt.toISOString(),
  };
}

export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
export type FxRateSource = z.infer<typeof fxRateSourceSchema>;
export type FxRoundingPolicy = z.infer<typeof fxRoundingPolicySchema>;
export type FxRateInput = z.infer<typeof fxRateSchema>;
export type FxPreviewInput = z.input<typeof fxPreviewInputSchema>;
export type FxPreview = {
  baseAmountMinor: number;
  baseCurrency: CurrencyCode;
  quoteAmountMinor: number;
  quoteCurrency: CurrencyCode;
  rate: number;
  source: FxRateSource;
  roundingPolicy: FxRoundingPolicy;
  quotedAt: string;
};
