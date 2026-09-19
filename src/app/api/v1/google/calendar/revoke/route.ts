import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit/audit-logger';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { decryptCredential } from '@/lib/google/credential-crypto';
import { revokeGoogleToken } from '@/lib/google/oauth-revoke';
import { googleCalendarPushService } from '@/services/google-calendar-push.service';

const MSG_REVOKED = 'Conexao com o Google revogada.';
const MSG_NETWORK = 'Nao foi possivel falar com o Google. Tente novamente.';
const MSG_NOT_CONFIRMED = 'O Google nao confirmou a revogacao. Tente novamente.';
const MSG_RATE_LIMITED =
  'O Google limitou as tentativas. Aguarde alguns instantes e tente novamente.';
const MSG_UNREADABLE =
  'Nao foi possivel ler a credencial do Google. Reconecte a agenda e tente novamente.';

/** Desfecho da parada do canal push, gravado na auditoria da desconexao. */
type ChannelStop =
  | 'none'
  | 'stopped'
  | 'skipped_token_invalid'
  | 'pending_skipped'
  | 'failed_orphaned';

/** Resposta 502 de uma revogacao que o Google nao confirmou: a linha fica. */
function revokeFailure(message: string, code: string, headers?: Record<string, string>) {
  return NextResponse.json(apiResponse(null, message, null, code), { status: 502, headers });
}

/**
 * POST /api/v1/google/calendar/revoke
 *
 * Desconecta o Google Calendar do admin. ORDEM DO GAP-12: parar o canal push,
 * depois revogar o refresh token no Google, depois remover a credencial local.
 *
 * Credencial ilegivel (decrypt falha): 500 `GOOGLE_CREDENTIAL_UNREADABLE`, sem
 * parar o canal, sem revogar e sem remover a linha.
 *
 * Parada do canal (`channelStop`, gravado na auditoria):
 * - sem `channelId`: `none`;
 * - `channelId` sem `resourceId` (watch pendente): `pending_skipped`, sem chamar
 *   o stop, com `logger.warn`;
 * - `channelId` e `resourceId`: `stopCurrentChannel`; sucesso vale `stopped`;
 * - stop falha com `AppError` `GOOGLE_REFRESH_TOKEN_INVALID`:
 *   `skipped_token_invalid`, com `logger.warn`, e segue para a revogacao
 *   (nenhum retry resolve token revogado);
 * - stop falha por qualquer outro motivo (rede, 429 ou 5xx em `channels.stop`,
 *   erro de banco): `failed_orphaned` e segue para a revogacao (decisao ST005 =
 *   3 do GAP-12). O `logger.warn` e a auditoria levam `channelExpiration`: o
 *   canal remoto expira sozinho nessa data e, ate la, o webhook responde 404
 *   para o canal desconhecido.
 *
 * Revogacao (`revokeGoogleToken`, token no corpo form do POST, nunca na URL):
 *
 * | `kind`             | Status | Code                                      | Log                          |
 * |--------------------|--------|-------------------------------------------|------------------------------|
 * | `revoked`          | 200    | sem code                                  | nenhum                       |
 * | `already_invalid`  | 200    | sem code                                  | warn com `errorCode`         |
 * | `rate_limited`     | 502    | `GOOGLE_CALENDAR_REVOKE_RATE_LIMITED`     | warn com `retryAfterSeconds` |
 * | `upstream_error`   | 502    | `GOOGLE_CALENDAR_REVOKE_UPSTREAM_ERROR`   | error com `status`           |
 * | `invalid_response` | 502    | `GOOGLE_CALENDAR_REVOKE_INVALID_RESPONSE` | error com `status`           |
 * | `rejected`         | 502    | `GOOGLE_CALENDAR_REVOKE_REJECTED`         | error com `status` e code    |
 * | `network_error`    | 502    | `GOOGLE_CALENDAR_REVOKE_NETWORK_ERROR`    | error com `errorName`        |
 *
 * `rate_limited` devolve o header `Retry-After` quando o Google informou os
 * segundos. Nos 502 a credencial local permanece para nova tentativa. Nos dois
 * 200 a linha sai e a auditoria grava `{ scope, revokeResult, channelStop }`,
 * mais `channelExpiration` quando `channelStop` e `failed_orphaned`.
 *
 * Todo log leva `userId` e nunca o objeto de erro, o refresh token (em claro ou
 * cifrado), `channelId`, `resourceId` ou o corpo do Google.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.id;

  const credential = await prisma.googleCalendarCredential.findUnique({
    where: { userId },
  });
  if (!credential) {
    return NextResponse.json(
      apiResponse(null, 'Nenhuma conexao Google ativa.'),
      { status: 404 },
    );
  }

  // 1. Decrypt protegido: credencial ilegivel nao derruba a rota nem sai do banco.
  let refreshToken: string;
  try {
    refreshToken = decryptCredential(credential.refreshTokenEnc);
  } catch {
    logger.error('google_calendar_revoke_credential_unreadable', {
      userId,
      credentialId: credential.id,
    });
    return NextResponse.json(
      apiResponse(null, MSG_UNREADABLE, null, 'GOOGLE_CREDENTIAL_UNREADABLE'),
      { status: 500 },
    );
  }

  // 2. Parar o canal ANTES de revogar: com o token revogado o Google recusaria
  //    o `channels.stop`.
  const channelExpiration = credential.channelExpiration?.toISOString() ?? null;
  let channelStop: ChannelStop = 'none';
  if (credential.channelId && credential.resourceId) {
    try {
      await googleCalendarPushService.stopCurrentChannel(userId);
      channelStop = 'stopped';
    } catch (stopError) {
      const errorCode = stopError instanceof AppError ? stopError.code : undefined;
      if (errorCode === 'GOOGLE_REFRESH_TOKEN_INVALID') {
        channelStop = 'skipped_token_invalid';
        logger.warn('google_calendar_revoke_channel_stop_skipped', {
          userId,
          channelStop,
        });
      } else {
        const errorName = stopError instanceof Error ? stopError.name : 'UnknownError';
        channelStop = 'failed_orphaned';
        logger.warn('google_calendar_revoke_channel_stop_failed', {
          userId,
          channelStop,
          channelExpiration,
          errorCode,
          errorName,
        });
      }
    }
  } else if (credential.channelId) {
    channelStop = 'pending_skipped';
    logger.warn('google_calendar_revoke_channel_pending_skipped', {
      userId,
      channelStop,
    });
  }

  // 3. Revogar no Google, com um code por desfecho de falha.
  const result = await revokeGoogleToken(refreshToken);
  switch (result.kind) {
    case 'revoked':
      break;
    case 'already_invalid':
      logger.warn('google_calendar_revoke_already_invalid', {
        userId,
        errorCode: result.errorCode,
      });
      break;
    case 'rate_limited':
      logger.warn('google_calendar_revoke_rate_limited', {
        userId,
        retryAfterSeconds: result.retryAfterSeconds,
      });
      return revokeFailure(
        MSG_RATE_LIMITED,
        'GOOGLE_CALENDAR_REVOKE_RATE_LIMITED',
        result.retryAfterSeconds === null
          ? undefined
          : { 'Retry-After': String(result.retryAfterSeconds) },
      );
    case 'upstream_error':
      logger.error('google_calendar_revoke_upstream_error', {
        userId,
        status: result.status,
      });
      return revokeFailure(MSG_NOT_CONFIRMED, 'GOOGLE_CALENDAR_REVOKE_UPSTREAM_ERROR');
    case 'invalid_response':
      logger.error('google_calendar_revoke_invalid_response', {
        userId,
        status: result.status,
      });
      return revokeFailure(MSG_NOT_CONFIRMED, 'GOOGLE_CALENDAR_REVOKE_INVALID_RESPONSE');
    case 'rejected':
      logger.error('google_calendar_revoke_rejected', {
        userId,
        status: result.status,
        errorCode: result.errorCode,
      });
      return revokeFailure(MSG_NOT_CONFIRMED, 'GOOGLE_CALENDAR_REVOKE_REJECTED');
    case 'network_error':
      logger.error('google_calendar_revoke_network_error', {
        userId,
        errorName: result.errorName,
      });
      return revokeFailure(MSG_NETWORK, 'GOOGLE_CALENDAR_REVOKE_NETWORK_ERROR');
  }

  // 4. Revogado (ou ja invalido no Google): remover a credencial e auditar.
  await prisma.googleCalendarCredential.delete({ where: { userId } });
  await auditLog(
    'GOOGLE_CALENDAR_DISCONNECTED',
    { type: 'GoogleCalendarCredential', id: credential.id },
    userId,
    channelStop === 'failed_orphaned'
      ? { scope: credential.scope, revokeResult: result.kind, channelStop, channelExpiration }
      : { scope: credential.scope, revokeResult: result.kind, channelStop },
  );

  return NextResponse.json(apiResponse(null, null, MSG_REVOKED));
}
