/**
 * Revogacao do token OAuth junto ao Google (GAP-12).
 *
 * Contratos de seguranca:
 * - O token vai no CORPO do POST (form-urlencoded), NUNCA na query da URL:
 *   query strings costumam ser logadas por proxies e aparecem em trilhas de
 *   auditoria de infraestrutura.
 * - O token em claro NUNCA e logado: este modulo nao emite log de nenhum tipo.
 *   Quem registra o desfecho e a rota, a partir do resultado discriminado.
 * - Nenhum caminho lanca, e nenhum resultado carrega o token, o corpo textual
 *   da resposta, `error_description` ou a message de um erro.
 */
import 'server-only';

export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Tamanho maximo do `error` do Google devolvido em `rejected`. */
const MAX_ERROR_CODE_LENGTH = 64;

/** Resultado discriminado por `kind`: cada desfecho da revogacao tem o seu. */
export type GoogleRevokeResult =
  | { kind: 'revoked' }
  | { kind: 'already_invalid'; errorCode: 'invalid_token' | 'invalid_grant' }
  | { kind: 'rate_limited'; retryAfterSeconds: number | null }
  | { kind: 'upstream_error'; status: number }
  | { kind: 'invalid_response'; status: number }
  | { kind: 'rejected'; status: number; errorCode: string | null }
  | { kind: 'network_error'; errorName: string };

/**
 * `Retry-After` so vale como inteiro nao negativo de segundos; a forma
 * HTTP-date, valor negativo, fracionario ou ausente vira `null`.
 */
function parseRetryAfterSeconds(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

/**
 * Revoga um token no endpoint oficial de revogacao do Google.
 *
 * - Rejeicao do `fetch`: `network_error` com o nome do erro, sem a message.
 * - 2xx: `revoked`, sem ler o corpo.
 * - 429: `rate_limited`, com `retryAfterSeconds` do header `Retry-After`.
 * - 5xx: `upstream_error`, sem ler o corpo.
 * - Demais status: corpo JSON lido em try. Falha de parse ou corpo que nao seja
 *   objeto devolve `invalid_response`; `error` igual a `invalid_token` ou
 *   `invalid_grant` devolve `already_invalid` (o Google ja nao reconhece o
 *   token); qualquer outro devolve `rejected` com `errorCode` truncado em 64
 *   caracteres, ou `null` quando `error` nao for string.
 */
export async function revokeGoogleToken(token: string): Promise<GoogleRevokeResult> {
  let res: Response;
  try {
    res = await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch (err) {
    return { kind: 'network_error', errorName: err instanceof Error ? err.name : 'UnknownError' };
  }

  if (res.ok) {
    return { kind: 'revoked' };
  }

  if (res.status === 429) {
    return {
      kind: 'rate_limited',
      retryAfterSeconds: parseRetryAfterSeconds(res.headers?.get?.('retry-after')),
    };
  }

  if (res.status >= 500) {
    return { kind: 'upstream_error', status: res.status };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: 'invalid_response', status: res.status };
  }
  if (typeof body !== 'object' || body === null) {
    return { kind: 'invalid_response', status: res.status };
  }

  const error = (body as { error?: unknown }).error;
  if (error === 'invalid_token' || error === 'invalid_grant') {
    return { kind: 'already_invalid', errorCode: error };
  }
  return {
    kind: 'rejected',
    status: res.status,
    errorCode: typeof error === 'string' ? error.slice(0, MAX_ERROR_CODE_LENGTH) : null,
  };
}
