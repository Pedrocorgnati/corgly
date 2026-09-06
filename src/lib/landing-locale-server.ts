import { cookies, headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { defaultLocale, locales, LOCALE_COOKIE, type Locale } from '../../i18n/config';

function normalize(value: string | undefined | null): Locale | null {
  if (!value) return null;
  return locales.includes(value as Locale) ? (value as Locale) : null;
}

function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const langs = header
    .split(',')
    .map((part) => part.trim().split(';')[0] ?? '')
    .filter(Boolean);

  for (const lang of langs) {
    const lower = lang.toLowerCase();
    if (lower.startsWith('pt')) return 'pt-BR';
    if (lower.startsWith('en')) return 'en-US';
    if (lower.startsWith('it')) return 'it-IT';
    if (lower.startsWith('es')) return 'es-ES';
    const exact = normalize(lang);
    if (exact) return exact;
  }
  return null;
}

export function resolveLandingLocaleFromRequest(request: NextRequest): Locale {
  const param =
    normalize(request.nextUrl.searchParams.get('locale')) ??
    normalize(request.nextUrl.searchParams.get('lang'));
  if (param) return param;

  const cookieLocale = normalize(request.cookies.get(LOCALE_COOKIE)?.value);
  if (cookieLocale) return cookieLocale;

  const acceptLocale = fromAcceptLanguage(request.headers.get('accept-language'));
  if (acceptLocale) return acceptLocale;

  return defaultLocale;
}

export async function resolveLandingLocaleServer(): Promise<Locale> {
  const headerStore = await headers();
  const fromHeader = normalize(headerStore.get('x-landing-locale'));
  if (fromHeader) return fromHeader;

  const cookieStore = await cookies();
  const cookieLocale = normalize(cookieStore.get(LOCALE_COOKIE)?.value);
  if (cookieLocale) return cookieLocale;

  const acceptLocale = fromAcceptLanguage(headerStore.get('accept-language'));
  if (acceptLocale) return acceptLocale;

  return defaultLocale;
}

export const LANDING_LOCALE_HEADER = 'x-landing-locale';
