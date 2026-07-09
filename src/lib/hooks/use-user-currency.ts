'use client';

import { useLocale } from 'next-intl';
import { useState, useCallback } from 'react';
import { type Currency } from '@/lib/currency';
import { resolveChargeCurrency } from '@/lib/billing/currency-policy';

const STORAGE_KEY = 'corgly.preferredCurrency';

/**
 * Resolve a moeda do usuario via a politica unica de moeda de registro
 * (`resolveChargeCurrency`, ADR-0006 §2):
 *   1. localStorage `corgly.preferredCurrency` (escolha explicita).
 *   2. Mapeamento pelo locale ativo do next-intl.
 *   3. Fallback DEFAULT_CHARGE_CURRENCY.
 *
 * Expoe `setCurrency` que persiste a escolha.
 */
export function useUserCurrency(): {
  currency: Currency;
  setCurrency: (c: Currency) => void;
} {
  const locale = useLocale();

  const [currency, setCurrencyState] = useState<Currency>(() => {
    if (typeof window === 'undefined') return resolveChargeCurrency({ locale });
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return resolveChargeCurrency({ explicit: stored, locale });
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
