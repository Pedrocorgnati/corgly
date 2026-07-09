import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  displayFxPreview,
  resolveFxSource,
  getRoundingPolicy,
  isFxRateStale,
  FX_RATE_MAX_AGE_MS,
  type FxRateCandidate,
} from '@/lib/billing/currency-policy';
import { isSupportedCurrency, type Currency } from '@/lib/currency';

const PreviewQuerySchema = z.object({
  from: z.string().toUpperCase().refine(isSupportedCurrency, { message: 'Moeda de origem nao suportada.' }),
  to: z.string().toUpperCase().refine(isSupportedCurrency, { message: 'Moeda de destino nao suportada.' }),
  amount: z.coerce.number().int().nonnegative().default(10000),
});

/** Taxas SEED hardcoded (base USD) usadas como fallback quando nao ha FxRate no DB. */
const SEED_RATES: Record<Currency, number> = {
  USD: 1,
  USDC: 1,
  EUR: 0.92,
  BRL: 5.0,
};

/**
 * GET /api/v1/fx/preview
 *
 * Retorna preview de conversao FX (display-only, nunca define valor cobrado).
 * Query params: from, to, amount (em centavos, default 10000 = R$100/US$100)
 *
 * Exemplo: GET /api/v1/fx/preview?from=USD&to=BRL&amount=10000
 *
 * Resposta:
 *   data.baseAmountMinor  — valor de entrada em centavos
 *   data.baseCurrency     — moeda de origem
 *   data.quoteAmountMinor — valor convertido em centavos
 *   data.quoteCurrency    — moeda de destino
 *   data.rate             — taxa aplicada
 *   data.source           — fonte da taxa (OPEN_EXCHANGE_RATES | STRIPE | SEED | MANUAL)
 *   data.roundingPolicy   — politica de arredondamento aplicada
 *   data.quotedAt         — timestamp ISO 8601 da cotacao
 *   data.stale            — true quando a taxa tem mais de 24h (ainda valida ate 48h)
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const parsed = PreviewQuerySchema.safeParse({
    from: searchParams.get('from') ?? 'USD',
    to: searchParams.get('to') ?? 'BRL',
    amount: searchParams.get('amount') ?? '10000',
  });

  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Parametros invalidos.'),
      { status: 400 },
    );
  }

  const { from, to, amount } = parsed.data;
  const fromCurrency = from as Currency;
  const toCurrency = to as Currency;

  // Par identico: taxa 1, sem consulta ao DB.
  if (fromCurrency === toCurrency) {
    const now = new Date().toISOString();
    return NextResponse.json(
      apiResponse({
        baseAmountMinor: amount,
        baseCurrency: fromCurrency,
        quoteAmountMinor: amount,
        quoteCurrency: toCurrency,
        rate: 1,
        source: 'SEED',
        roundingPolicy: getRoundingPolicy(toCurrency),
        quotedAt: now,
        stale: false,
      }),
    );
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - FX_RATE_MAX_AGE_MS);

  // Busca taxas disponíveis no DB para o par solicitado.
  const dbRates = await prisma.fxRate.findMany({
    where: {
      baseCurrency: fromCurrency as never,
      quoteCurrency: toCurrency as never,
      collectedAt: { gte: cutoff },
    },
    orderBy: { collectedAt: 'desc' },
    take: 10,
  });

  let candidates: FxRateCandidate[] = dbRates.map((r) => ({
    source: r.source as FxRateCandidate['source'],
    rate: Number(r.rate),
    collectedAt: r.collectedAt,
  }));

  // Injeta SEED hardcoded como candidato final de fallback (sempre fresco).
  const seedRate = fromCurrency === 'USD'
    ? SEED_RATES[toCurrency]
    : toCurrency === 'USD'
      ? 1 / SEED_RATES[fromCurrency]
      : SEED_RATES[toCurrency] / SEED_RATES[fromCurrency];

  candidates = [
    ...candidates,
    { source: 'SEED', rate: seedRate, collectedAt: now },
  ];

  let resolved: FxRateCandidate;
  try {
    resolved = resolveFxSource(toCurrency, candidates, now);
  } catch {
    return NextResponse.json(
      apiResponse(null, 'Nenhuma taxa FX disponivel para o par solicitado.'),
      { status: 503 },
    );
  }

  const isStale24h = now.getTime() - resolved.collectedAt.getTime() > 24 * 60 * 60 * 1000;

  const validFrom = resolved.collectedAt;
  const validUntil = new Date(resolved.collectedAt.getTime() + FX_RATE_MAX_AGE_MS);

  const preview = displayFxPreview({
    amountMinor: amount,
    baseCurrency: fromCurrency,
    quoteCurrency: toCurrency,
    rate: resolved.rate,
    source: resolved.source,
    roundingPolicy: getRoundingPolicy(toCurrency),
    validFrom,
    validUntil,
    quotedAt: now,
  });

  return NextResponse.json(
    apiResponse({
      ...preview,
      stale: isStale24h,
    }),
  );
}
