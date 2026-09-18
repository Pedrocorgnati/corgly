import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { decryptCredential } from '@/lib/google/credential-crypto';
import { getGoogleOAuthConfig } from '@/lib/google/oauth-config';
import {
  googleCalendarStatusSchema,
  type GoogleCalendarStatusDto,
} from '@/app/(admin)/admin/google-calendar/google-calendar-status.contract';

/**
 * GET /api/v1/google/calendar/status
 *
 * Estado REAL da conexao do professor com a agenda Google (loop 09-06, item 020):
 *
 * - `disconnected`: nenhuma credencial para o usuario.
 * - `connected`: troca `grant_type=refresh_token` contra o Google respondeu ok.
 * - `expired`: o Google respondeu `invalid_grant` — unico detector honesto de
 *   revogacao/expiracao, ja que o refresh token nao carrega data de expiracao
 *   e o modelo nao tem campo de estado. A credencial local NAO e removida
 *   nesse caminho: desconectar e acao do professor via rota `revoke`.
 *
 * Falha de rede ou 5xx do Google na verificacao: 502 com codigo rastreavel —
 * a tela trata esse retorno como erro de carregamento, nao como estado de
 * conexao.
 *
 * O refresh token em claro so existe em variavel local do request e o
 * `access_token` devolvido pelo Google e descartado em memoria ao fim do
 * request: NUNCA persistido, NUNCA logado, NUNCA no payload (mesma regra do
 * ST006 da task 019).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const credential = await prisma.googleCalendarCredential.findUnique({
    where: { userId: auth.id },
  });

  if (!credential) {
    return respondeCom({
      state: 'disconnected',
      connectedAt: null,
      lastSuccessfulSyncAt: null,
      scope: null,
    });
  }

  let config;
  try {
    config = getGoogleOAuthConfig();
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        apiResponse(null, err.message, null, err.code),
        { status: err.status },
      );
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }

  const refreshToken = decryptCredential(credential.refreshTokenEnc);

  let tokenRes: Response;
  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    });
  } catch {
    return falhaDeVerificacao();
  }

  const tokenBody = (await tokenRes.json().catch(() => ({}))) as { error?: string };
  // O access_token (quando presente) morre aqui: so existe nesta variavel
  // local, nunca toca payload, log ou banco.

  if (!tokenRes.ok && tokenBody.error !== 'invalid_grant') {
    return falhaDeVerificacao();
  }

  const state = tokenRes.ok ? 'connected' : 'expired';
  return respondeCom({
    state,
    connectedAt: credential.connectedAt.toISOString(),
    // Carimbo real da ultima sincronizacao concluida: gravado pelo push
    // service em GoogleCalendarCredential.lastSyncAt. null apenas quando
    // nenhuma sincronizacao terminou ainda (credencial conectada, sync
    // pendente) — a UI exibe "Nenhuma sincronizacao concluida ainda".
    lastSuccessfulSyncAt: credential.lastSyncAt
      ? credential.lastSyncAt.toISOString()
      : null,
    scope: credential.scope,
  });
}

/** 502 rastreavel quando o Google nao confirma o estado (rede ou 5xx). */
function falhaDeVerificacao(): NextResponse {
  return NextResponse.json(
    apiResponse(
      null,
      'Nao foi possivel verificar a conexao com o Google. Tente novamente.',
      null,
      'GOOGLE_CALENDAR_STATUS_CHECK_FAILED',
    ),
    { status: 502 },
  );
}

/** Monta a resposta validada contra o contrato antes de sair. */
function respondeCom(dto: GoogleCalendarStatusDto): NextResponse {
  const validado = googleCalendarStatusSchema.parse(dto);
  return NextResponse.json(apiResponse(validado));
}
