'use client';

import { useContext } from 'react';
import { LandingLocaleContext } from '@/hooks/landingLocaleContext';

/**
 * Ponto de leitura único do idioma no cliente. O valor é semeado pelo servidor
 * via `LandingLocaleProvider` (root layout) — ver `landingLocaleContext.tsx`.
 */
export function useLandingLocale() {
  const ctx = useContext(LandingLocaleContext);
  if (!ctx) {
    throw new Error('useLandingLocale deve ser usado dentro de <LandingLocaleProvider>');
  }
  return ctx;
}
