'use client';

import { useLocale } from 'next-intl';
import { useState, useCallback } from 'react';
import {
  localeToCurrency,
  isSupportedCurrency,
  type Currency,
} from '@/lib/currency';

const STORAGE_KEY = 'corgly.preferredCurrency';

/**
 * Resolve a moeda do usuario:
 *   1. localStorage `corgly.preferredCurrency` (escolha explicita).
 *   2. Mapeamento pelo locale ativo do next-intl.
 *
 * Expoe `setCurrency` que persiste a escolha.
 */
export function useUserCurrency(): {
  currency: Currency;
  setCurrency: (c: Currency) => void;
} {
  const locale = useLocale();

  const [currency, setCurrencyState] = useState<Currency>(() => {
    if (typeof window === 'undefined') return localeToCurrency(locale);
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSupportedCurrency(stored)) return stored;
    return localeToCurrency(locale);
  });

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    try {
      window.localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // storage pode estar bloqueado (private mode) — ignora
    }
  }, []);

  return { currency, setCurrency };
}
