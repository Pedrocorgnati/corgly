export * from './enums';
export * from './routes';

export const APP_NAME = 'Corgly';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://corgly.app';

// Pricing (USD)
export const PRICING = {
  SINGLE: 25,
  PACK_5: 110, // $22/aula
  PACK_10: 190, // $19/aula
  MONTHLY: 160, // $20/aula × 8
  INTRO_DISCOUNT: 0.5, // 50% first lesson
} as const;

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
