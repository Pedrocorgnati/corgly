import { LOCALE_COOKIE, defaultLocale, locales, type Locale } from '../../i18n/config';

/**
 * Locale suportado pelo produto.
 *
 * NAO ha lista propria aqui: o tipo e um apelido de `Locale` (`i18n/config.ts`),
 * unica fonte da verdade dos idiomas do app. Antes este modulo redeclarava a
 * uniao literal, o que permitia as duas listas divergirem em silencio — um
 * quinto idioma entraria no `i18n/config` e o `detectLocale` continuaria
 * recusando-o sem erro de compilacao.
 */
export type SupportedLocale = Locale;

/** Copia mutavel de `locales`, derivada — nunca redigitada. */
export const SUPPORTED_LOCALES: SupportedLocale[] = [...locales];
export const DEFAULT_LOCALE: SupportedLocale = defaultLocale;

// Re-export LOCALE_COOKIE from i18n/config to keep a single source of truth
export { LOCALE_COOKIE };

/**
 * Apelidos aceitos -> locale canonico, DERIVADOS de `SUPPORTED_LOCALES`.
 *
 * Para cada locale sao aceitos: a forma canonica em minusculas (`pt-br`), a
 * variante com underscore (`pt_br`) e a lingua base (`pt`). A lingua base fica
 * com o primeiro locale que a reivindica, na ordem de `locales`.
 *
 * Derivar em vez de digitar e o que impede o retorno do defeito: um idioma novo
 * em `i18n/config.ts` passa a ser aceito aqui sem que ninguem lembre de editar
 * uma segunda tabela.
 */
const LOCALE_ALIASES: Record<string, SupportedLocale> = SUPPORTED_LOCALES.reduce(
  (acc, locale) => {
    const lower = locale.toLowerCase();
    acc[lower] = locale;
    acc[lower.replace('-', '_')] = locale;
    const base = lower.split('-')[0];
    if (!(base in acc)) acc[base] = locale;
    return acc;
  },
  {} as Record<string, SupportedLocale>,
);

/** Maps raw locale strings (from cookies/Accept-Language) to a SupportedLocale. */
function normalizeLocale(raw: string): SupportedLocale | null {
  const normalized = raw.toLowerCase().trim();
  return (
    LOCALE_ALIASES[normalized] ||
    LOCALE_ALIASES[normalized.split('-')[0]] ||
    LOCALE_ALIASES[normalized.split('_')[0]] ||
    null
  );
}

/**
 * Detects the preferred locale using the following priority:
 *  1. corgly_locale cookie (user's explicit preference)
 *  2. Accept-Language header
 *  3. Fallback: en-US
 *
 * Accepts a ReadonlyRequestCookies-compatible object (from `await cookies()`)
 * or any object with a `.get(name)` method.
 */
export function detectLocale(
  cookieStore: { get(name: string): { value: string } | undefined },
  acceptLanguage?: string,
): SupportedLocale {
  // 1. User's saved preference cookie
  const cookieVal = cookieStore.get(LOCALE_COOKIE)?.value;
  if (cookieVal) {
    const normalized = normalizeLocale(cookieVal);
    if (normalized) return normalized;
  }

  // 2. Accept-Language header (comma-separated, q-weighted)
  if (acceptLanguage) {
    const langs = acceptLanguage
      .split(',')
      .map((l) => l.split(';')[0].trim())
      .filter(Boolean);
    for (const lang of langs) {
      const normalized = normalizeLocale(lang);
      if (normalized) return normalized;
    }
  }

  // 3. Fallback
  return DEFAULT_LOCALE;
}
