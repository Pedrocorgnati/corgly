import { LOCALE_COOKIE } from '../../i18n/config';

export type SupportedLocale = 'pt-BR' | 'en-US' | 'es-ES' | 'it-IT';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['pt-BR', 'en-US', 'es-ES', 'it-IT'];
export const DEFAULT_LOCALE: SupportedLocale = 'en-US';

// Re-export LOCALE_COOKIE from i18n/config to keep a single source of truth
export { LOCALE_COOKIE };

/** Maps raw locale strings (from cookies/Accept-Language) to a SupportedLocale. */
function normalizeLocale(raw: string): SupportedLocale | null {
  const normalized = raw.toLowerCase().trim();
  const map: Record<string, SupportedLocale> = {
    'pt': 'pt-BR', 'pt-br': 'pt-BR', 'pt_br': 'pt-BR',
    'en': 'en-US', 'en-us': 'en-US', 'en_us': 'en-US',
    'es': 'es-ES', 'es-es': 'es-ES', 'es_es': 'es-ES',
    'it': 'it-IT', 'it-it': 'it-IT', 'it_it': 'it-IT',
  };
  return map[normalized] || map[normalized.split('-')[0]] || map[normalized.split('_')[0]] || null;
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
