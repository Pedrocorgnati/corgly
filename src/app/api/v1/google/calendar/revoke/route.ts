import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit/audit-logger';
import { decryptCredential } from '@/lib/google/credential-crypto';
import { revokeGoogleRefreshToken } from '@/lib/google/oauth-revoke';
import { googleCalendarPushService } from '@/services/google-calendar-push.service';

/**
 * POST /api/v1/google/calendar/revoke
 *
 * Revoga a conexao do professor. ORDEM DO GAP-12: revogar o refresh token
 * junto ao Google ANTES de parar o canal; falha do stop nao bloqueia mais a
 * revogacao (o token ja foi revogado e o canal expira sozinho). O token vai
 * no CORPO do POST de revogacao, nunca na query da URL, e em claro NUNCA vai
 * a logs; a trilha de auditoria nao carrega segredo.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const credential = await prisma.googleCalendarCredential.findUnique({
    where: { userId: auth.id },
  });
  if (!credential) {
    return NextResponse.json(
      apiResponse(null, 'Nenhuma conexao Google ativa.'),
      { status: 404 },
    );
  }

  const refreshToken = decryptCredential(credential.refreshTokenEnc);

  // 1. REVOGAR PRIMEIRO (GAP-12). Falha de rede ou 5xx mantem a credencial
  //    local e respondem 502 (revogacao reintentavel).
  const revoke = await revokeGoogleRefreshToken(refreshToken);
  if (!revoke.ok) {
    return NextResponse.json(
      apiResponse(
        null,
        revoke.reason === 'network'
          ? 'Nao foi possivel falar com o Google. Tente novamente.'
          : 'O Google nao confirmou a revogacao. Tente novamente.',
      ),
      { status: 502 },
    );
  }

  // 2. Parar o canal DEPOIS da revogacao, em modo best-effort: o token ja foi
  //    revogado, entao uma falha do stop nao pode mais devolver 502 sem
  //    revogar (o defeito do GAP-12). O canal expira sozinho; o ocorrido fica
  //    registrado na trilha de auditoria.
  let channelStop: 'stopped' | 'failed-after-revoke' = 'stopped';
  if (credential.channelId && credential.resourceId) {
    try {
      await googleCalendarPushService.stopCurrentChannel(auth.id);
    } catch {
      channelStop = 'failed-after-revoke';
    }
  }

  await prisma.googleCalendarCredential.delete({ where: { userId: auth.id } });
  await auditLog(
    'GOOGLE_CALENDAR_DISCONNECTED',
    { type: 'GoogleCalendarCredential', id: credential.id },
    auth.id,
    { scope: credential.scope, channelStop },
  );

  return NextResponse.json(apiResponse(null, null, 'Conexao com o Google revogada.'));
}
