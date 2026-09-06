export * from './enums';
export * from './geo';
export * from './routes';

import {
  MONTHLY_OPTIONS,
  PACK10_USD,
  SINGLE_USD,
  monthlyTotalUsd,
} from './landing';

export const APP_NAME = 'Corgly';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://corgly.app';

/**
 * Preços públicos em USD.
 *
 * FONTE DA VERDADE: `src/lib/constants/landing.ts` — é a landing que publica os
 * valores ao mercado. Aqui NÃO se digita número que já exista lá; importa-se.
 * A tabela multi-moeda (centavos por BRL/USD/EUR/USDC) é outra coisa e vive
 * exclusivamente em `src/lib/pricing/config.ts`; nunca converta câmbio aqui.
 *
 * O que continua literal neste arquivo é apenas o que a landing não vende:
 * o pacote de 5 aulas (fora da vitrine, ainda suportado no backend) e os
 * parâmetros da assinatura LEGADA por cadência semanal.
 */
export const PRICING = {
  SINGLE: SINGLE_USD,
  PACK_5: 110, // $22/aula — fora da vitrine da landing, mantido para dados antigos
  PACK_10: PACK10_USD, // $19/aula
  /** Planos mensais publicados na landing: 10 aulas (US$ 170) e 20 aulas (US$ 300). */
  MONTHLY_10: monthlyTotalUsd(MONTHLY_OPTIONS[0].lessons),
  MONTHLY_20: monthlyTotalUsd(MONTHLY_OPTIONS[1].lessons),
  /**
   * Assinatura LEGADA (eixo `weeklyFrequency`): preço por aula usado apenas por
   * assinaturas antigas, que não têm `monthlyLessons`. Não é preço de vitrine.
   */
  MONTHLY_PER_LESSON: 16,
  WEEKS_PER_MONTH: 4.33,
  INTRO_DISCOUNT: 0.5, // 50% first lesson
} as const;

/**
 * Calcula o preço mensal (USD) da assinatura LEGADA por frequência semanal.
 * Planos novos são precificados por `monthlyLessons` em
 * `src/lib/billing/subscription-pricing.ts`.
 */
export function calcMonthlyPrice(weeklyFreq: number): number {
  return Math.ceil(weeklyFreq * PRICING.MONTHLY_PER_LESSON * PRICING.WEEKS_PER_MONTH);
}

// Booking rules
export const BOOKING_RULES = {
  MIN_ADVANCE_HOURS: 24,
  CANCELLATION_WINDOW_HOURS: 24,
  MAX_FUTURE_SESSIONS: 3,
  SESSION_DURATION_MINUTES: 55,
  AUTO_CONFIRM_MINUTES: 15, // after session end
} as const;

// Timezone default
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

// Pagination
export const PAGINATION = {
  STUDENT_HISTORY: 10,
  ADMIN_SESSIONS: 20,
  ADMIN_STUDENTS: 20,
  FEEDBACK_HISTORY: 20,
  DASHBOARD_RECENT: 10,
  DASHBOARD_UPCOMING: 50,
  USER_DETAIL_SESSIONS: 10,
  USER_DETAIL_PAYMENTS: 10,
  USER_DETAIL_TOP_SESSIONS: 5,
  MAX_SEARCH_RESULTS: 100,
  DEFAULT: 20,
} as const;

// UI Timing (ms)
export const UI_TIMING = {
  LOGOUT_REDIRECT: 2_000,
  BANNER_AUTO_HIDE: 5_000,
  ONBOARDING_TRANSITION: 300,
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  SESSION: {
    DISCOUNT_DISMISSED: 'discount_dismissed',
    EMAIL_BANNER_DISMISSED: 'corgly_email_confirm_banner_dismissed',
  },
} as const;
