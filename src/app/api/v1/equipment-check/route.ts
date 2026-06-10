import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireAuth } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limit';
import { withApiHandler } from '@/lib/api-handler';
import { equipmentCheckService } from '@/lib/equipment/equipment-check.service';

/**
 * POST /api/v1/equipment-check
 *
 * Persiste o resultado de um teste de equipamento (câmera, microfone, permissão
 * e banda) feito na pré-aula. Funciona autenticado OU anônimo: quando há sessão
 * válida, o resultado é vinculado ao usuário; caso contrário é gravado como
 * anônimo. O rate limit usa o userId quando autenticado e o IP quando anônimo,
 * com janela mais estrita no caso anônimo para evitar abuso.
 */

// Limites locais (não poluem RATE_LIMITS globais; este endpoint é específico).
const RL_AUTHENTICATED = { maxRequests: 30, windowMs: 60_000 };
const RL_ANONYMOUS = { maxRequests: 8, windowMs: 60_000 };

export const POST = withApiHandler(async (request: NextRequest) => {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';

  // Autenticação opcional: se o middleware injetou x-user-id, validamos a
  // sessão. Header presente porém inválido => 401 (não cai para anônimo).
  let userId: string | null = null;
  if (request.headers.get('x-user-id')) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    userId = auth.id;
  }

  // Rate limit por identidade efetiva.
  const rlKey = userId ? `equip:user:${userId}` : `equip:ip:${ip}`;
  const rlConfig = userId ? RL_AUTHENTICATED : RL_ANONYMOUS;
  const rl = await checkRateLimit(rlKey, rlConfig);
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas verificações em sequência. Aguarde um instante.'),
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      apiResponse(null, 'Corpo da requisição inválido (JSON malformado).'),
      { status: 400 },
    );
  }

  const parsed = equipmentCheckService.schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados do teste de equipamento inválidos.'),
      { status: 400 },
    );
  }

  const result = await equipmentCheckService.persistResult(parsed.data, {
    userId,
    ip,
  });

  return NextResponse.json(
    apiResponse(
      result,
      null,
      result.passed
        ? 'Equipamento pronto para a aula.'
        : 'Encontramos pontos a ajustar antes da aula.',
    ),
    { status: 201 },
  );
});
