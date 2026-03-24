import type { SupportedLanguage } from '@/types/enums';

export const locales = ['pt-BR', 'en-US', 'es-ES', 'it-IT'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en-US';

/** Mapa de locale → label nativo */
export const localeLabels: Record<Locale, string> = {
  'pt-BR': 'Português',
  'en-US': 'English',
  'es-ES': 'Español',
  'it-IT': 'Italiano',
};

/** Converte SupportedLanguage (PT_BR) → Locale (pt-BR) */
export function supportedLanguageToLocale(lang: SupportedLanguage): Locale {
  const map: Record<SupportedLanguage, Locale> = {
    PT_BR: 'pt-BR',
    EN_US: 'en-US',
    ES_ES: 'es-ES',
    IT_IT: 'it-IT',
  };
  return map[lang] ?? defaultLocale;
}

/** Converte Locale (pt-BR) → SupportedLanguage (PT_BR) */
export function localeToSupportedLanguage(locale: Locale): SupportedLanguage {
  const map: Record<Locale, SupportedLanguage> = {
    'pt-BR': 'PT_BR',
    'en-US': 'EN_US',
    'es-ES': 'ES_ES',
    'it-IT': 'IT_IT',
  };
  return map[locale] ?? 'EN_US';
}

export const LOCALE_COOKIE = 'corgly_locale';
