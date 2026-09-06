import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { defaultLocale, locales, type Locale, LOCALE_COOKIE, supportedLanguageToLocale } from './config';
import { COOKIE_NAME, verifyJWT } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { SupportedLanguage } from '@/types/enums';

function fromAcceptLanguage(header: string): Locale | undefined {
  return header
    .split(',')
    .map((l) => l.split(';')[0].trim())
    .find((l): l is Locale => locales.includes(l as Locale));
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  let locale: Locale | undefined;

  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const payload = verifyJWT(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { preferredLanguage: true },
      });
      if (user?.preferredLanguage) {
        locale = supportedLanguageToLocale(user.preferredLanguage as SupportedLanguage);
      }
    } catch {
      // invalid session — fall through
    }
  }

  if (!locale) {
    const headerLocale = headerStore.get('x-landing-locale');
    if (headerLocale && locales.includes(headerLocale as Locale)) {
      locale = headerLocale as Locale;
    }
  }

  if (!locale) {
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value as Locale | undefined;
    if (cookieLocale && locales.includes(cookieLocale)) {
      locale = cookieLocale;
    }
  }

  if (!locale) {
    locale = fromAcceptLanguage(headerStore.get('accept-language') ?? '') ?? defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
