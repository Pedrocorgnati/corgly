'use client';

import { useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { defaultLocale, locales, LOCALE_COOKIE, type Locale } from '../../i18n/config';
import { LandingLocaleContext } from '@/hooks/landingLocaleContext';

const STORAGE_KEY = 'corgly_locale';
const LOCALE_CHANGE_EVENT = 'corgly-locale-change';

function mapNavigatorLocale(lang: string): Locale | null {
  const lower = lang.toLowerCase();
  if (lower.startsWith('pt')) return 'pt-BR';
  if (lower.startsWith('en')) return 'en-US';
  if (lower.startsWith('it')) return 'it-IT';
  if (lower.startsWith('es')) return 'es-ES';
  return null;
}

function detectLocale(fallback: Locale): Locale {
  try {
    const search = new URLSearchParams(window.location.search);
    const param = search.get('locale') ?? search.get('lang');
    if (param && locales.includes(param as Locale)) {
      localStorage.setItem(STORAGE_KEY, param);
      return param as Locale;
    }
  } catch {
    // URLSearchParams unavailable
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && locales.includes(stored as Locale)) {
      return stored as Locale;
    }
  } catch {
    // private mode
  }

  const langs =
    typeof navigator !== 'undefined'
      ? navigator.languages?.length
        ? [...navigator.languages]
        : [navigator.language ?? '']
      : [];

  for (const lang of langs) {
    const mapped = mapNavigatorLocale(lang);
    if (mapped) return mapped;
  }

  return fallback;
}

function persistCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;SameSite=Lax`;
}

export function useLandingLocale() {
  const initialLocale = useContext(LandingLocaleContext) ?? defaultLocale;
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    setLocaleState(detectLocale(initialLocale));

    const handler = (e: Event) => {
      const custom = e as CustomEvent<Locale>;
      if (locales.includes(custom.detail)) {
        setLocaleState(custom.detail);
      }
    };

    window.addEventListener(LOCALE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handler);
  }, [initialLocale]);

  const setLocale = useCallback(
    (newLocale: Locale) => {
      if (!locales.includes(newLocale)) return;

      try {
        localStorage.setItem(STORAGE_KEY, newLocale);
      } catch {
        // ignore
      }

      try {
        persistCookie(newLocale);
      } catch {
        // ignore
      }

      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('locale') !== newLocale) {
          url.searchParams.set('locale', newLocale);
          window.history.replaceState(null, '', url.toString());
        }
      } catch {
        // ignore
      }

      window.dispatchEvent(new CustomEvent<Locale>(LOCALE_CHANGE_EVENT, { detail: newLocale }));
      setLocaleState(newLocale);
      router.refresh();
    },
    [router],
  );

  return { locale, setLocale };
}
