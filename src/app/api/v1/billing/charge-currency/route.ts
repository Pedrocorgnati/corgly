import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  resolveChargeCurrency,
  DEFAULT_CHARGE_CURRENCY,
} from '@/lib/billing/currency-policy';
import { isSupportedCurrency, type Currency } from '@/lib/currency';

const SetCurrencySchema = z.object({
  currency: z
    .string()
    .toUpperCase()
    .refine(isSupportedCurrency, { message: 'Moeda nao suportada. Use: USD, BRL, EUR ou USDC.' }),
});

/**
 * GET /api/v1/billing/charge-currency
 *
 * Retorna a moeda de cobranca de registro do usuario autenticado.
 * Ordem de resolucao (ADR-0006 §2):
 *   1. preferredCurrency persistido no banco.
 *   2. locale do header Accept-Language.
 *   3. DEFAULT_CHARGE_CURRENCY (USD).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const user = await prisma.user.findUnique({
    where: { id: authResult.id },
    select: { preferredCurrency: true, preferredLanguage: true },
  });

  if (!user) {
    return NextResponse.json(apiResponse(null, 'Usuario nao encontrado.'), { status: 404 });
  }

  const locale = request.headers.get('accept-language')?.split(',')[0] ?? undefined;
  const currency: Currency = resolveChargeCurrency({
    explicit: user.preferredCurrency ?? null,
    locale,
  });

  return NextResponse.json(
    apiResponse({
      currency,
      persisted: user.preferredCurrency ?? null,
      supported: ['USD', 'BRL', 'EUR', 'USDC'] as Currency[],
    }),
  );
}

/**
 * PATCH /api/v1/billing/charge-currency
 *
 * Persiste a preferencia de moeda de cobranca do usuario.
 * Valida que a moeda e suportada antes de salvar (Zero Fluxos Incompletos).
 * Nao promete que a cobranca sera feita nessa moeda — a moeda de registro
 * efetiva de cada cobranca e decidida no checkout por `resolveChargeCurrency`.
 *
 * Body: { currency: "BRL" | "USD" | "EUR" | "USDC" }
 */
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'Body invalido.'), { status: 400 });
  }

  const parsed = SetCurrencySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Moeda invalida.'),
      { status: 400 },
    );
  }

  const currency = parsed.data.currency as Currency;

  await prisma.user.update({
    where: { id: authResult.id },
    data: { preferredCurrency: currency as never },
  });

  return NextResponse.json(
    apiResponse({
      currency,
      message: `Preferencia de moeda salva: ${currency}. Cobranças futuras usarao esta moeda quando disponivel.`,
      disclaimer:
        'A moeda de registro efetiva de cada cobranca e confirmada no checkout. USDC disponivel conforme suporte do gateway.',
    }),
  );
}

export const dynamic = 'force-dynamic';
