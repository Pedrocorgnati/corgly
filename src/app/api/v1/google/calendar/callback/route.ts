import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { encryptCredential } from '@/lib/google/credential-crypto';
import {
  getGoogleOAuthConfig,
  GOOGLE_CALENDAR_READONLY_SCOPE,
} from '@/lib/google/oauth-config';
import { verifyOAuthState } from '@/lib/google/oauth-state';
import { googleCalendarPushService } from '@/services/google-calendar-push.service';

/**
 * GET /api/v1/google/calendar/callback
 *
 * Callback do consentimento OAuth. E GET de redirect do Google: chega sem
 * sessao por construcao, por isso o caminho COMPLETO esta em PUBLIC_API_PATHS
 * (src/proxy.ts). Nenhum segredo e persistido ou logado em claro: o
 * `refresh_token` entra cifrado via `encryptCredential`; o `access_token` e o
 * `expires_in` da troca sao descartados ao fim do request.
 *
 * Todo desfecho e um redirect 307 para /admin/google-calendar. Os de erro
 * levam `google=error` e um `reason` distinto (GAP-12):
 *
 * | reason                      | quando                                                  |
 * |-----------------------------|---------------------------------------------------------|
 * | valor de `error` do Google  | o professor recusou o consentimento (ex.: access_denied) |
 * | `invalid_state`             | state assinado invalido ou expirado                      |
 * | `exchange_failed`           | sem `code`; troca rejeitada fora dos casos abaixo, inclusive corpo de erro ilegivel |
 * | `exchange_network_error`    | o `fetch` da troca rejeitou (rede, DNS, TLS)             |
 * | `exchange_rate_limited`     | troca respondeu 429                                      |
 * | `exchange_upstream_error`   | troca respondeu 500 ou maior                             |
 * | `exchange_invalid_grant`    | troca respondeu 400 com `error: invalid_grant`           |
 * | `exchange_invalid_response` | troca 2xx com corpo ilegivel ou que nao e objeto         |
 * | `scope_rejected`            | escopo concedido sem a leitura ou com qualquer escrita   |
 * | `missing_refresh_token`     | troca sem `refresh_token` (consentimento reaproveitado)  |
 * | `credential_encrypt_failed` | `encryptCredential` lancou                               |
 * | `credential_persist_failed` | o upsert da credencial rejeitou                          |
 *
 * Sucesso: `google=connected`; com falha na criacao do canal de push,
 * `google=connected&channel=pending` (a credencial fica, o cron retoma).
 *
 * Logs: cada desfecho de erro a partir da troca gera uma linha do logger com
 * `userId`, `reason` e apenas metadados (`status`, `errorCode` truncado em 64
 * caracteres, `errorName`). Nenhum log leva `code`, `state`, `access_token`,
 * `refresh_token`, `id_token`, `client_secret`, `error_description`, corpo da
 * resposta de token, message ou objeto de erro.
 */

const WRITE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

/** Limite dos codigos de erro externos que vao ao log. */
const MAX_ERROR_CODE_LENGTH = 64;

function redirectToGoogleCalendar(
  request: NextRequest,
  params: Record<string, string>,
): NextResponse {
  // GAP-12: o resultado do consentimento precisa aparecer na tela da conexao.
  // O redirect volta para /admin/google-calendar (que renderiza o banner com
  // esses searchParams), nao para /admin/schedule, onde o professor nao via
  // confirmacao alguma (Zero Silencio).
  const url = new URL('/admin/google-calendar', request.url);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url.toString(), { status: 307 });
}

/** Nome da classe do erro. A message e o objeto nunca vao ao log. */
function errorNameOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.name : 'UnknownError';
}

/**
 * Campo string de um objeto qualquer, truncado para log; `null` quando o
 * objeto ou o campo nao existem ou quando o campo nao e string.
 */
function truncatedStringField(source: unknown, field: string): string | null {
  if (typeof source !== 'object' || source === null) return null;
  const value = (source as Record<string, unknown>)[field];
  return typeof value === 'string' ? value.slice(0, MAX_ERROR_CODE_LENGTH) : null;
}

/** Classifica a troca rejeitada (status fora de 2xx) num reason distinto. */
function exchangeRejectionReason(status: number, errorCode: string | null): string {
  if (status === 429) return 'exchange_rate_limited';
  if (status >= 500) return 'exchange_upstream_error';
  if (status === 400 && errorCode === 'invalid_grant') return 'exchange_invalid_grant';
  return 'exchange_failed';
}

function describeBodyType(body: unknown): string {
  if (body === null) return 'null';
  if (Array.isArray(body)) return 'array';
  return typeof body;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // 1. Professor recusou o consentimento (ex.: error=access_denied): nao chamar o Google.
  const oauthError = searchParams.get('error');
  if (oauthError) {
    return redirectToGoogleCalendar(request, { google: 'error', reason: oauthError });
  }

  // 2. State assinado (anti-CSRF): invalido ou expirado interrompe tudo.
  const state = searchParams.get('state') ?? '';
  let userId: string;
  try {
    userId = verifyOAuthState(state).userId;
  } catch {
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'invalid_state' });
  }

  // 3. Troca do codigo por tokens. Cada falha tem reason proprio (GAP-12) e
  //    nenhuma estoura 500 no callback do Google.
  const code = searchParams.get('code');
  if (!code) {
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'exchange_failed' });
  }

  let config;
  try {
    config = getGoogleOAuthConfig();
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message, null, err.code), { status: err.status });
    }
    throw err;
  }

  // 3a. Rede: o fetch rejeitou antes de haver resposta.
  let tokenRes: Response;
  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });
  } catch (fetchError) {
    const errorName = errorNameOf(fetchError);
    logger.error('google_calendar_callback_exchange_failed', {
      userId,
      reason: 'exchange_network_error',
      errorName,
    });
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'exchange_network_error' });
  }

  // 3b. Troca rejeitada: o corpo de erro e lido em try so para extrair o
  //     `error` (ex.: invalid_grant); `error_description` nunca vai ao log.
  if (!tokenRes.ok) {
    let errorBody: unknown;
    try {
      errorBody = await tokenRes.json();
    } catch {
      // Corpo de erro ilegivel: a classificacao fica so pelo status.
      errorBody = null;
    }
    const errorCode = truncatedStringField(errorBody, 'error');
    const reason = exchangeRejectionReason(tokenRes.status, errorCode);
    logger.warn('google_calendar_callback_exchange_rejected', {
      userId,
      reason,
      status: tokenRes.status,
      errorCode,
    });
    return redirectToGoogleCalendar(request, { google: 'error', reason });
  }

  // 3c. Troca 2xx: o corpo precisa ser um objeto JSON legivel.
  let rawBody: unknown;
  try {
    rawBody = await tokenRes.json();
  } catch (parseError) {
    const errorName = errorNameOf(parseError);
    logger.error('google_calendar_callback_exchange_invalid_response', {
      userId,
      reason: 'exchange_invalid_response',
      errorName,
    });
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'exchange_invalid_response' });
  }
  if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
    logger.error('google_calendar_callback_exchange_invalid_response', {
      userId,
      reason: 'exchange_invalid_response',
      bodyType: describeBodyType(rawBody),
    });
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'exchange_invalid_response' });
  }
  const tokenBody = rawBody as { scope?: unknown; refresh_token?: unknown };
  const grantedScope = typeof tokenBody.scope === 'string' ? tokenBody.scope : '';
  const refreshToken = typeof tokenBody.refresh_token === 'string' ? tokenBody.refresh_token : '';

  // 4. Assertiva de escopo (token a token, sem casamento por substring): o
  // consentimento precisa ter concedido exatamente a leitura; qualquer escopo
  // de escrita rejeita SEM escrita em banco. Integracao unidirecional e
  // restritiva (regra transversal, source.md L99).
  const grantedScopes = grantedScope.split(' ').filter(Boolean);
  const hasReadonly = grantedScopes.includes(GOOGLE_CALENDAR_READONLY_SCOPE);
  const hasWrite = WRITE_SCOPES.some((s) => grantedScopes.includes(s));
  if (!hasReadonly || hasWrite) {
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'scope_rejected' });
  }

  // 5. Sem refresh_token (consentimento reaproveitado sem prompt=consent): nao
  // ha o que guardar; o professor precisa refazer o consentimento.
  if (!refreshToken) {
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'missing_refresh_token' });
  }

  // 6. Persistencia cifrada (upsert por professor). access_token/expires_in
  // NUNCA sao persistidos nem logados: descartados ao fim do request.
  let refreshTokenEnc: string;
  try {
    refreshTokenEnc = encryptCredential(refreshToken);
  } catch (encryptError) {
    const errorName = errorNameOf(encryptError);
    logger.error('google_calendar_callback_credential_encrypt_failed', {
      userId,
      reason: 'credential_encrypt_failed',
      errorName,
    });
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'credential_encrypt_failed' });
  }

  let credentialUserId: string;
  try {
    const credential = await prisma.googleCalendarCredential.upsert({
      where: { userId },
      create: { userId, refreshTokenEnc, scope: grantedScope },
      update: { refreshTokenEnc, scope: grantedScope },
    });
    credentialUserId = credential.userId;
  } catch (persistError) {
    // So o nome e o `code` string do erro (codigo Prisma como P1001): a
    // message pode carregar dados da query.
    const errorName = errorNameOf(persistError);
    const errorCode = truncatedStringField(persistError, 'code');
    logger.error('google_calendar_callback_credential_persist_failed', {
      userId,
      reason: 'credential_persist_failed',
      errorName,
      errorCode,
    });
    return redirectToGoogleCalendar(request, { google: 'error', reason: 'credential_persist_failed' });
  }

  // 7. Criar o canal automaticamente. A credencial permanece persistida se o
  // Google estiver indisponivel, e o cron retoma o estado pending.
  try {
    await googleCalendarPushService.createChannel(credentialUserId);
  } catch (channelError) {
    const errorName = errorNameOf(channelError);
    logger.warn('google_calendar_callback_channel_pending', {
      userId,
      channelProvision: 'pending',
      errorName,
    });
    return redirectToGoogleCalendar(request, { google: 'connected', channel: 'pending' });
  }

  // 8. Sucesso.
  return redirectToGoogleCalendar(request, { google: 'connected' });
}
