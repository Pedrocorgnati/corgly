import { ROUTES } from '@/lib/constants/routes';

/**
 * Sanitizacao do parametro `redirectTo` usado pelo fluxo de MFA admin
 * (proxy -> /auth/mfa/challenge -> /auth/mfa/setup -> painel).
 *
 * Regras (fail-closed, devolve DEFAULT_ADMIN_REDIRECT em qualquer duvida):
 * - somente string comecando com "/" e nao com "//";
 * - sem barra invertida nem caracteres de controle ("/\evil.com" e resolvido
 *   pelo parser WHATWG como http://evil.com/);
 * - parse contra uma origem sentinela: a origem resultante tem de ser a mesma;
 * - o pathname normalizado tem de ficar sob /admin (unico produtor legitimo e o
 *   proxy, que sempre envia um pathname /admin/*);
 * - retorna pathname + search normalizados, nunca a string crua.
 *
 * Modulo sem dependencia de `next/*` de proposito: o proxy pode importa-lo.
 */

export const DEFAULT_ADMIN_REDIRECT: string = ROUTES.ADMIN_DASHBOARD;

const SENTINEL_ORIGIN = 'http://corgly-redirect.invalid';
const ADMIN_PREFIX = '/admin';
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function sanitizeAdminRedirectTo(candidate: unknown): string {
  if (typeof candidate !== 'string' || candidate.length === 0) return DEFAULT_ADMIN_REDIRECT;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return DEFAULT_ADMIN_REDIRECT;
  if (candidate.includes('\\') || CONTROL_CHARS.test(candidate)) return DEFAULT_ADMIN_REDIRECT;

  let url: URL;
  try {
    url = new URL(candidate, SENTINEL_ORIGIN);
  } catch {
    return DEFAULT_ADMIN_REDIRECT;
  }

  if (url.origin !== SENTINEL_ORIGIN) return DEFAULT_ADMIN_REDIRECT;
  if (url.pathname === ADMIN_PREFIX) return DEFAULT_ADMIN_REDIRECT;
  if (!url.pathname.startsWith(`${ADMIN_PREFIX}/`)) return DEFAULT_ADMIN_REDIRECT;

  return url.pathname + url.search;
}

/** Monta `path?redirectTo=<target>` com URLSearchParams (nunca concatenacao crua). */
export function withRedirectTo(path: string, target: string): string {
  const params = new URLSearchParams({ redirectTo: target });
  return `${path}?${params.toString()}`;
}
