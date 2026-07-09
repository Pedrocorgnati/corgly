import { NextRequest, NextResponse } from 'next/server';
import { MagicLinkRequestSchema } from '@/schemas/auth.schema';
import { magicLinkService } from '@/lib/auth/magic-link.service';
import { apiResponse } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { withApiHandler } from '@/lib/api-handler';

/**
 * T-045 — POST /api/v1/auth/magic-link/request
 *
 * Solicita um magic-link (login sem senha). Sempre responde de forma uniforme
 * para impedir enumeração de emails (AC4). Rate limit 3 req / 10 min por
 * par (email+IP) (AC2).
 */

/** Mensagem uniforme — idêntica em sucesso, email inexistente e erro (AC4). */
const UNIFORM_MESSAGE =
  'Se este email estiver cadastrado, você receberá um link de acesso.';

/** Mensagem genérica de rate-limit — não revela estado da conta (AC2). */
const RATE_LIMIT_MESSAGE =
  'Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.';

export const POST = withApiHandler(async (request: NextRequest) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  let email = '';
  let parsedOk = false;
  try {
    const body = await request.json();
    const parsed = MagicLinkRequestSchema.safeParse(body);
    if (parsed.success) {
      email = parsed.data.email.toLowerCase();
      parsedOk = true;
    }
  } catch {
    // Body inválido / ausente — cai na resposta uniforme abaixo.
  }

  // Rate limit por par (email+IP) (AC2). Quando o email é inválido, ainda
  // aplicamos o limite por IP para não abrir um bypass do rate-limit.
  const rlKey = `magic-link:${parsedOk ? email : 'invalid'}:${ip}`;
  const rl = await checkRateLimit(rlKey, RATE_LIMITS.AUTH_MAGIC_LINK);
  if (!rl.allowed) {
    return NextResponse.json(apiResponse(null, RATE_LIMIT_MESSAGE), { status: 429 });
  }

  // Email inválido: responde uniforme (não vaza que a validação falhou).
  if (!parsedOk) {
    return NextResponse.json(apiResponse(null, null, UNIFORM_MESSAGE));
  }

  // requestMagicLink nunca lança por email inexistente (no-op silencioso).
  await magicLinkService.requestMagicLink(email, ip);

  return NextResponse.json(apiResponse(null, null, UNIFORM_MESSAGE));
});
