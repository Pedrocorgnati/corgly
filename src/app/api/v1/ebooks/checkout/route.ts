import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import { env } from '@/lib/env';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  createEbookCheckoutSession,
  EbookCheckoutError,
  type EbookCheckoutErrorCode,
} from '@/lib/ebooks';

/**
 * POST /api/v1/ebooks/checkout
 *
 * Compra anonima de ebook: cria a Stripe Checkout Session de pagamento unico e
 * devolve a URL hospedada. Sem autenticacao por design (allowlist do proxy).
 *
 * Ordem das defesas: 415 content-type -> 403 Origin -> 429 rate limit (IP+UA)
 * -> 413 tamanho -> 400 schema estrito -> servico (422/503/502/504) -> 201.
 *
 * Mensagens antes de resolver o ebook sao neutras em ingles curto: o idioma do
 * ebook ainda nao e conhecido. Depois de resolver, o servico usa a copia do
 * catalogo. A mensagem do gateway nunca chega a resposta.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Corpo esperado e minusculo ({ slug, withdrawalWaiver }); 1 KiB sobra.
const MAX_BODY_BYTES = 1024;

const MESSAGES = {
  unsupportedMediaType: 'Unsupported media type.',
  originNotAllowed: 'Origin not allowed.',
  rateLimited: 'Too many requests. Try again shortly.',
  payloadTooLarge: 'Payload too large.',
  invalidInput: 'Invalid input.',
  methodNotAllowed: 'Method not allowed.',
} as const;

// withdrawalWaiver so aceita o booleano `true`: o consentimento de
// arrependimento e acao positiva do comprador, nunca default.
const CheckoutBodySchema = z
  .object({
    slug: z
      .string()
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    withdrawalWaiver: z.literal(true),
  })
  .strict();

function errorResponse(
  status: number,
  code: EbookCheckoutErrorCode,
  message: string,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(apiResponse(null, message, null, code), {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** Fingerprint (IP + hash curto do UA), mesmo formato da rota de leads. */
function buildRateLimitKey(request: NextRequest): string {
  const ip = getClientIp(request);
  const uaHash = createHash('sha256')
    .update(request.headers.get('user-agent') ?? 'no-ua')
    .digest('hex')
    .slice(0, 12);
  return `ebook-checkout:${ip}:${uaHash}`;
}

/**
 * Origin ausente passa (navegacao same-origin sem o header, clientes HTTP);
 * presente so passa se for exatamente a origem do app. `'null'` nao passa: a
 * pagina de venda e same-origin, entao nao ha caso legitimo para ele.
 */
function isOriginAllowed(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  return origin === new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

export const POST = withApiHandler(async (request: NextRequest) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return errorResponse(415, 'EBOOK_CHECKOUT_UNSUPPORTED_MEDIA_TYPE', MESSAGES.unsupportedMediaType);
  }

  if (!isOriginAllowed(request)) {
    return errorResponse(403, 'EBOOK_CHECKOUT_ORIGIN_NOT_ALLOWED', MESSAGES.originNotAllowed);
  }

  // Fail-open herdado de checkRateLimit quando o Redis nao esta configurado.
  const rl = await checkRateLimit(buildRateLimitKey(request), RATE_LIMITS.EBOOK_CHECKOUT);
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return errorResponse(429, 'EBOOK_CHECKOUT_RATE_LIMITED', MESSAGES.rateLimited, {
      'Retry-After': String(retryAfter),
    });
  }

  // Content-Length declarado e checado antes de ler; o corpo real e medido
  // depois, porque o header pode faltar ou mentir.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413, 'EBOOK_CHECKOUT_PAYLOAD_TOO_LARGE', MESSAGES.payloadTooLarge);
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return errorResponse(413, 'EBOOK_CHECKOUT_PAYLOAD_TOO_LARGE', MESSAGES.payloadTooLarge);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, 'EBOOK_CHECKOUT_INVALID_INPUT', MESSAGES.invalidInput);
  }
  const parsed = CheckoutBodySchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse(400, 'EBOOK_CHECKOUT_INVALID_INPUT', MESSAGES.invalidInput);
  }

  try {
    const { checkoutUrl } = await createEbookCheckoutSession({ slug: parsed.data.slug });
    return NextResponse.json(apiResponse({ checkoutUrl }), {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    if (err instanceof EbookCheckoutError) {
      return errorResponse(err.status, err.code as EbookCheckoutErrorCode, err.message);
    }
    // Qualquer outra falha sobe para o withApiHandler (500 generico).
    throw err;
  }
});

function methodNotAllowed(): NextResponse {
  return errorResponse(405, 'EBOOK_CHECKOUT_METHOD_NOT_ALLOWED', MESSAGES.methodNotAllowed, {
    Allow: 'POST',
  });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
