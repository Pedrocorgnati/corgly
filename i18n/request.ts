import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { defaultLocale, locales, type Locale, LOCALE_COOKIE } from './config';

export default getRequestConfig(async () => {
  // 1. Tentar cookie salvo pelo usuário
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value as Locale | undefined;

  // 2. Tentar Accept-Language header
  const headerStore = await headers();
  const acceptLanguage = headerStore.get('accept-language') ?? '';
  const browserLocale = acceptLanguage
    .split(',')
    .map((l) => l.split(';')[0].trim())
    .find((l): l is Locale => locales.includes(l as Locale));

  const locale: Locale =
    (cookieLocale && locales.includes(cookieLocale) ? cookieLocale : undefined) ??
    browserLocale ??
    defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
