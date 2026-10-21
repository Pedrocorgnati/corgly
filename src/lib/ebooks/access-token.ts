import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

/**
 * Token do link permanente de acesso ao ebook (D-C1, D-C15).
 *
 * Contrato:
 * - O token cru so existe no e-mail enviado ao comprador; o banco guarda
 *   apenas `hashEbookAccessToken(token)` (sha256 hex) em `EbookAccessToken`.
 * - O lookup do item 007 valida o formato antes de qualquer consulta e busca
 *   pelo hash, nunca pelo token cru.
 */

const EBOOK_ACCESS_TOKEN_BYTES = 32;
const EBOOK_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Gera um token aleatorio de 32 bytes em base64url (43 caracteres, sem padding). */
export function generateEbookAccessToken(): string {
  return randomBytes(EBOOK_ACCESS_TOKEN_BYTES).toString('base64url');
}

/** Hash sha256 hex (64 caracteres) do token cru, unica forma persistida. */
export function hashEbookAccessToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** true somente para um token base64url de exatamente 43 caracteres. */
export function isWellFormedEbookAccessToken(raw: string): boolean {
  return EBOOK_ACCESS_TOKEN_PATTERN.test(raw);
}

/** URLs do link permanente e da pagina de desistencia para o token cru. */
export function buildEbookAccessUrls(
  token: string,
  appUrl: string,
): { accessUrl: string; withdrawalUrl: string } {
  const base = appUrl.replace(/\/+$/, '');

  return {
    accessUrl: `${base}/ebooks/acesso/${token}`,
    withdrawalUrl: `${base}/ebooks/acesso/${token}/desistir`,
  };
}
