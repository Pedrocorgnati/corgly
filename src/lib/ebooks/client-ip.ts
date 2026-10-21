import 'server-only';

/** Teto de `EbookAccessLog.ip` (VarChar(45), cabe um IPv6 com zona curta). */
export const EBOOK_CLIENT_IP_MAX_LENGTH = 45;

/**
 * IP do cliente pela mesma regra de `getClientIp` em `src/proxy.ts`: primeiro
 * valor de `x-forwarded-for`, senao `x-real-ip`, senao `'unknown'`. Valor vazio
 * apos o trim cai para o proximo. Truncado a 45 chars para caber no log.
 */
export function getEbookClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = headers.get('x-real-ip')?.trim();
  const ip = forwarded || realIp || 'unknown';
  return ip.slice(0, EBOOK_CLIENT_IP_MAX_LENGTH);
}
