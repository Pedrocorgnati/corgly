/**
 * Canonical analytics event names used across client + server.
 * Keep names stable — dashboards, funnels and provider configs depend on them.
 */
export const AnalyticsEvents = {
  // Acquisition
  VIEW_LANDING: 'view_landing',
  CLICK_CTA: 'click_cta',
  VIEW_PRICING: 'view_pricing',

  // Signup / auth
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  LOGIN: 'login',

  // Checkout / purchase
  INITIATE_CHECKOUT: 'initiate_checkout',
  CHECKOUT_COMPLETED: 'checkout_completed',
  PURCHASE: 'purchase',

  // Session lifecycle
  SESSION_BOOKED: 'session_booked',
  JOIN_ROOM: 'join_room',
  SESSION_COMPLETED: 'session_completed',

  // Engagement / feedback
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  CONTENT_VIEWED: 'content_viewed',
  REFERRAL_SHARED: 'referral_shared',
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

/**
 * Funnel steps used by admin dashboard aggregation.
 * Order matters — drop-off is computed left-to-right.
 */
export const FunnelSteps: Array<{
  key: string;
  label: string;
  event: AnalyticsEventName;
}> = [
  { key: 'visitors', label: 'Visitantes', event: AnalyticsEvents.VIEW_LANDING },
  { key: 'signup', label: 'Cadastros', event: AnalyticsEvents.SIGNUP_COMPLETED },
  { key: 'checkout', label: 'Checkout', event: AnalyticsEvents.INITIATE_CHECKOUT },
  { key: 'purchase', label: 'Compras', event: AnalyticsEvents.PURCHASE },
];

export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;
