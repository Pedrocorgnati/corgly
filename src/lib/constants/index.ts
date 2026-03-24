export * from './enums';
export * from './geo';
export * from './routes';

export const APP_NAME = 'Corgly';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://corgly.app';

// Pricing (USD)
export const PRICING = {
  SINGLE: 25,
  PACK_5: 110,  // $22/aula
  PACK_10: 190, // $19/aula
  // MONTHLY é calculado dinamicamente: weeklyFreq × MONTHLY_PER_LESSON × WEEKS_PER_MONTH
  // Exemplo: 2×/sem → Math.ceil(2 × 16 × 4.33) = $139
  MONTHLY_PER_LESSON: 16,
  WEEKS_PER_MONTH: 4.33,
  INTRO_DISCOUNT: 0.5, // 50% first lesson
} as const;

/** Calcula o preço mensal por frequência semanal (USD). */
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
