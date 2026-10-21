import type { EbookLocale } from '@/lib/ebooks/schema';
import type { Locale } from '../../../i18n/config';

// O conteudo do ebook pode nao bater com o locale da pagina; cada ebook
// resolve seus textos pelo proprio locale.
export const EBOOK_LOCALE_TO_APP_LOCALE: Readonly<Record<EbookLocale, Locale>> = {
  en: 'en-US',
  es: 'es-ES',
  it: 'it-IT',
};

export function ebookAppLocale(locale: EbookLocale): Locale {
  return EBOOK_LOCALE_TO_APP_LOCALE[locale];
}
