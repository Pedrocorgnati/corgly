import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import { getIceServers } from '@/lib/iceServers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/v1/ice-config
 *
 * Gera a configuracao STUN/TURN no servidor para manter secrets TURN e imports
 * server-only fora do grafo de componentes client.
 */
export const GET = withApiHandler(async (request: NextRequest) => {
  const userId = request.headers.get('x-user-id') ?? 'anonymous';
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = await checkRateLimit(`ice-config:${userId}:${ip}`, RATE_LIMITS.GENERAL);

  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas solicitacoes. Aguarde um instante.'),
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  return NextResponse.json(apiResponse({ iceServers: getIceServers(userId) }));
});
