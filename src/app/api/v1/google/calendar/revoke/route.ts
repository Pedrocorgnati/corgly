import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit/audit-logger';
import { decryptCredential } from '@/lib/google/credential-crypto';
import { googleCalendarPushService } from '@/services/google-calendar-push.service';

/**
 * POST /api/v1/google/calendar/revoke
 *
 * Revoga a conexao do professor: chama o endpoint de revogacao do Google com o
 * refresh token decifrado em memoria e remove a credencial local. Resposta ok
 * OU corpo `invalid_token` (ja revogado do lado Google) remove a linha; falha
 * de rede ou 5xx mantem a credencial e responde 502 (revogacao reintentavel).
 * O token em claro NUNCA vai a logs; a trilha de auditoria nao carrega segredo.
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

  if (credential.channelId && credential.resourceId) {
    try {
      await googleCalendarPushService.stopCurrentChannel(auth.id);
    } catch {
      return NextResponse.json(
        apiResponse(null, 'Nao foi possivel parar o canal do Google. Tente novamente.'),
        { status: 502 },
      );
    }
  }

  let revokeRes: Response;
  try {
    revokeRes = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
      { method: 'POST' },
    );
  } catch {
    // Falha de rede: credencial local permanece, revogacao reintentavel.
    return NextResponse.json(
      apiResponse(null, 'Nao foi possivel falar com o Google. Tente novamente.'),
      { status: 502 },
    );
  }

  if (!revokeRes.ok) {
    const body = (await revokeRes.json().catch(() => ({}))) as { error?: string };
    if (body.error !== 'invalid_token') {
      // 5xx ou outro erro do Google: credencial local permanece.
      return NextResponse.json(
        apiResponse(null, 'O Google nao confirmou a revogacao. Tente novamente.'),
        { status: 502 },
      );
    }
    // invalid_token: ja revogado do lado Google; remover a linha local.
  }

  await prisma.googleCalendarCredential.delete({ where: { userId: auth.id } });
  await auditLog(
    'GOOGLE_CALENDAR_DISCONNECTED',
    { type: 'GoogleCalendarCredential', id: credential.id },
    auth.id,
    { scope: credential.scope },
  );

  return NextResponse.json(apiResponse(null, null, 'Conexao com o Google revogada.'));
}
