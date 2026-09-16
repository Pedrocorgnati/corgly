/**
 * Revogacao do refresh token junto ao Google (GAP-12).
 *
 * Contratos de seguranca:
 * - O token vai no CORPO do POST (form-urlencoded), NUNCA na query da URL:
 *   query strings costumam ser logadas por proxies e aparecem em trilhas de
 *   auditoria de infraestrutura.
 * - O token em claro NUNCA e logado; esta funcao nao toca em console.
 */

export type GoogleRevokeResult =
  | { ok: true; alreadyRevoked: boolean }
  | { ok: false; reason: 'network' | 'google_error' };

/**
 * Revoga um refresh token no endpoint oficial de revogacao do Google.
 *
 * - Resposta 2xx: revogado agora (`alreadyRevoked: false`).
 * - Corpo `invalid_token`: o Google ja nao reconhece o token; tratado como
 *   sucesso idempotente (`alreadyRevoked: true`) para permitir a limpeza da
 *   credencial local.
 * - Falha de rede ou resposta 5xx/outra: `ok: false` e a credencial local
 *   deve permanecer (revogacao reintentavel pelo usuario).
 */
export async function revokeGoogleRefreshToken(
  refreshToken: string,
): Promise<GoogleRevokeResult> {
  let res: Response;
  try {
    res = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (res.ok) {
    return { ok: true, alreadyRevoked: false };
  }

  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (body.error === 'invalid_token') {
    return { ok: true, alreadyRevoked: true };
  }
  return { ok: false, reason: 'google_error' };
}
