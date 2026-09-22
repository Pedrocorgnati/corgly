'use client';

import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import {
  LOCALE_COOKIE,
  localeToSupportedLanguage,
  locales,
  type Locale,
} from '../../i18n/config';

/**
 * Única fonte da verdade do idioma no cliente.
 *
 * O estado inicial é SEMEADO PELO SERVIDOR (`initialLocale` = `getLocale()` do
 * next-intl na root layout, que já resolve DB → cookie → Accept-Language), então
 * o primeiro paint já vem com a bandeira/idioma corretos — sem flash de 'en-US'
 * e sem detecção em useEffect. O cliente só:
 *
 *  - SINCRONIZA outras instâncias de `useLandingLocale` na mesma página via
 *    evento `corgly-locale-change`;
 *  - para ANÔNIMOS, reconcilia com o localStorage (cache quando o cookie
 *    sumir/bloquear). Para LOGADOS o servidor (DB) manda e essa reconciliação
 *    é pulada — era a causa das bandeiras divergentes entre landing e app.
 *
 * NUNCA lemos nem gravamos o parâmetro `?locale=` da URL: ele grudava no
 * endereço e mandava sobre cookie/DB em re-mounts (idioma "mudando sozinho").
 */

const STORAGE_KEY = 'corgly_locale';
const LOCALE_CHANGE_EVENT = 'corgly-locale-change';

export interface LandingLocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const LandingLocaleContext = createContext<LandingLocaleContextValue | null>(null);

function persistCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;SameSite=Lax`;
}

function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (locales as readonly string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    // private mode / storage bloqueado
  }
  return null;
}

export function LandingLocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  // Guard contra refresh loop: só pede re-render server-side quando o locale
  // efetivamente muda (router.refresh() re-entra aqui com novo initialLocale).
  const lastRefreshLocale = useRef<Locale | null>(null);

  const requestServerRefresh = useCallback(
    (next: Locale) => {
      if (lastRefreshLocale.current === next) return;
      lastRefreshLocale.current = next;
      router.refresh();
    },
    [router],
  );

  // Escrita única e simétrica: state + localStorage + cookie + evento para as
  // demais instâncias na página + (quando logado) perfil/DB. Logado, o refresh
  // do servidor espera o PATCH completar — o servidor prioriza o DB do usuário
  // (i18n/request.ts) e um refresh adiantado re-renderia com o idioma velho.
  const setLocale = useCallback(
    (next: Locale) => {
      if (!(locales as readonly string[]).includes(next)) return;

      setLocaleState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage indisponível — o cookie ainda vale
      }
      persistCookie(next);
      window.dispatchEvent(new CustomEvent<Locale>(LOCALE_CHANGE_EVENT, { detail: next }));

      if (user) {
        apiClient
          .patch(API.PROFILE, { preferredLanguage: localeToSupportedLanguage(next) })
          .then(() => requestServerRefresh(next))
          .catch(() => toast.error('Could not save language. Try again.'));
      } else {
        requestServerRefresh(next);
      }
    },
    [user, requestServerRefresh],
  );

  // Instâncias distintas do seletor na mesma página (ex.: header + footer)
  // trocam entre si por evento, sem passar pelo storage. Os efeitos abaixo
  // também reaproveitam esse canal para aplicar mudanças — assim o setState
  // só acontece dentro de callback de evento, nunca direto no corpo do efeito.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Locale>).detail;
      if ((locales as readonly string[]).includes(detail)) {
        setLocaleState(detail);
      }
    };
    window.addEventListener(LOCALE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handler);
  }, []);

  // O servidor re-resolver o locale (ex.: login, refresh pós-setLocale) ganha
  // do estado local — mantém cliente e servidor na mesma página.
  useEffect(() => {
    if (locale !== initialLocale) {
      window.dispatchEvent(
        new CustomEvent<Locale>(LOCALE_CHANGE_EVENT, { detail: initialLocale }),
      );
    }
  }, [initialLocale, locale]);

  useEffect(() => {
    // Limpa `?locale=`/`?lang=` herdado de versões antigas — o parâmetro era
    // gravado na URL e re-aplicado em todo re-mount, por cima do cookie/DB.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('locale') || url.searchParams.has('lang')) {
        url.searchParams.delete('locale');
        url.searchParams.delete('lang');
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      // URL indisponível — ignorar
    }

    if (isAuthLoading || user) return;

    // Anônimo: localStorage é o cache de última escolha quando o cookie não
    // chegou ao servidor (bloqueio, expiração). Logado: o efeito é pulado
    // porque o DB do usuário é a fonte da verdade (i18n/request.ts).
    const stored = readStoredLocale();
    if (stored && stored !== locale) {
      persistCookie(stored);
      requestServerRefresh(stored);
      window.dispatchEvent(new CustomEvent<Locale>(LOCALE_CHANGE_EVENT, { detail: stored }));
    }
  }, [isAuthLoading, user, locale, requestServerRefresh]);

  return (
    <LandingLocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LandingLocaleContext.Provider>
  );
}
