import { ROUTES } from '@/lib/constants/routes';

export const LESSON_DURATION_MINUTES = 50;
export const FIRST_LESSON_USD = 12.5;
export const SINGLE_USD = 25;
export const PACK10_USD = 190;
export const PACK10_PER = 19;
export const MONTHLY_OPTIONS = [
  { lessons: 10, per: 17 },
  { lessons: 20, per: 15 },
] as const;
export type MonthlyLessons = (typeof MONTHLY_OPTIONS)[number]['lessons'];
export const MONTHLY_LESSONS = MONTHLY_OPTIONS[0].lessons;
export const MONTHLY_PER = MONTHLY_OPTIONS[0].per;
export const MONTHLY_USD = MONTHLY_LESSONS * MONTHLY_PER;

export function monthlyTotalUsd(lessons: MonthlyLessons): number {
  const option = MONTHLY_OPTIONS.find((item) => item.lessons === lessons) ?? MONTHLY_OPTIONS[0];
  return option.lessons * option.per;
}

export function monthlyPerUsd(lessons: MonthlyLessons): number {
  const option = MONTHLY_OPTIONS.find((item) => item.lessons === lessons) ?? MONTHLY_OPTIONS[0];
  return option.per;
}

export const CREDIT_EXPIRY_MONTHS = 6;

const FALLBACK_SITE_URL = 'https://corgly.app';

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function resolveSiteUrl(
  rawInput = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || FALLBACK_SITE_URL,
  nodeEnv = process.env.NODE_ENV,
): string {
  const raw = rawInput.replace(/\/$/, '');
  try {
    const hostname = new URL(raw).hostname;
    if (nodeEnv === 'production' && isLocalHost(hostname)) {
      return FALLBACK_SITE_URL;
    }
  } catch {
    if (nodeEnv === 'production') return FALLBACK_SITE_URL;
  }
  return raw;
}

export const SITE_URL = resolveSiteUrl();

export function firstLessonHref(isAuthenticated: boolean): string {
  return isAuthenticated ? `${ROUTES.CREDITS}?plan=SINGLE` : `${ROUTES.REGISTER}?intent=first-lesson`;
}

export function planHref(
  isAuthenticated: boolean,
  plan: 'SINGLE' | 'PACK_10' | 'MONTHLY',
  monthlyLessons?: MonthlyLessons,
): string {
  if (isAuthenticated) {
    if (plan === 'MONTHLY' && monthlyLessons) {
      return `${ROUTES.CREDITS}?plan=${plan}&lessons=${monthlyLessons}`;
    }
    return `${ROUTES.CREDITS}?plan=${plan}`;
  }
  return `${ROUTES.REGISTER}?intent=first-lesson`;
}

export function formatUsd(amount: number, locale: string): string {
  const isEn = locale.startsWith('en');
  if (Number.isInteger(amount)) {
    return `US$ ${amount}`;
  }
  if (isEn) {
    return `US$ ${amount.toFixed(2)}`;
  }
  return `US$ ${amount.toFixed(2).replace('.', ',')}`;
}
