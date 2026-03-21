// ── Enums centralizados (Module 2: Shared Foundations) ──

export const UserRole = {
  STUDENT: 'STUDENT',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const SessionStatus = {
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED_BY_STUDENT: 'CANCELLED_BY_STUDENT',
  CANCELLED_BY_ADMIN: 'CANCELLED_BY_ADMIN',
  NO_SHOW_STUDENT: 'NO_SHOW_STUDENT',
  NO_SHOW_ADMIN: 'NO_SHOW_ADMIN',
  INTERRUPTED: 'INTERRUPTED',
  RESCHEDULE_PENDING: 'RESCHEDULE_PENDING',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const CreditType = {
  SINGLE: 'SINGLE',
  PACK_5: 'PACK_5',
  PACK_10: 'PACK_10',
  MONTHLY: 'MONTHLY',
  PROMO: 'PROMO',
  MANUAL: 'MANUAL',
  REFUND: 'REFUND',
} as const;
export type CreditType = (typeof CreditType)[keyof typeof CreditType];

export const CreditStatus = {
  ACTIVE: 'ACTIVE',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
  REFUNDED: 'REFUNDED',
} as const;
export type CreditStatus = (typeof CreditStatus)[keyof typeof CreditStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
  PAST_DUE: 'PAST_DUE',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const BookingRuleViolation = {
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  PAST_SLOT: 'PAST_SLOT',
  LATE_CANCELLATION: 'LATE_CANCELLATION',
  MAX_FUTURE_SESSIONS: 'MAX_FUTURE_SESSIONS',
} as const;
export type BookingRuleViolation = (typeof BookingRuleViolation)[keyof typeof BookingRuleViolation];

export const FeedbackDimension = {
  LISTENING: 'LISTENING',
  SPEAKING: 'SPEAKING',
  WRITING: 'WRITING',
  VOCABULARY: 'VOCABULARY',
} as const;
export type FeedbackDimension = (typeof FeedbackDimension)[keyof typeof FeedbackDimension];

export const SupportedLanguage = {
  PT_BR: 'PT_BR',
  EN_US: 'EN_US',
  ES_ES: 'ES_ES',
  IT_IT: 'IT_IT',
} as const;
export type SupportedLanguage = (typeof SupportedLanguage)[keyof typeof SupportedLanguage];

export const ContentType = {
  VIDEO_GRAMMAR: 'VIDEO_GRAMMAR',
  VIDEO_VOCABULARY: 'VIDEO_VOCABULARY',
  VIDEO_PRONUNCIATION: 'VIDEO_PRONUNCIATION',
} as const;
export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export const EmailType = {
  CONFIRM_EMAIL: 'CONFIRM_EMAIL',
  RESET_PASSWORD: 'RESET_PASSWORD',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  REMINDER_24H: 'REMINDER_24H',
  REMINDER_1H: 'REMINDER_1H',
  FEEDBACK_AVAILABLE: 'FEEDBACK_AVAILABLE',
  CREDITS_EXPIRING_30D: 'CREDITS_EXPIRING_30D',
  CREDITS_EXPIRING_7D: 'CREDITS_EXPIRING_7D',
  BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
} as const;
export type EmailType = (typeof EmailType)[keyof typeof EmailType];

// ── Status Maps (status → label + cor) ──

export const SESSION_STATUS_MAP: Record<SessionStatus, { label: string; color: string; bg: string }> = {
  SCHEDULED: { label: 'Agendada', color: 'text-[#0284C7]', bg: 'bg-[#E0F2FE]' },
  IN_PROGRESS: { label: 'Em andamento', color: 'text-[#059669]', bg: 'bg-[#D1FAE5]' },
  COMPLETED: { label: 'Concluída', color: 'text-[#6B7280]', bg: 'bg-[#F3F4F6]' },
  CANCELLED_BY_STUDENT: { label: 'Cancelada pelo aluno', color: 'text-[#DC2626]', bg: 'bg-[#FEE2E2]' },
  CANCELLED_BY_ADMIN: { label: 'Cancelada pelo professor', color: 'text-[#DC2626]', bg: 'bg-[#FEE2E2]' },
  NO_SHOW_STUDENT: { label: 'Não compareceu', color: 'text-[#D97706]', bg: 'bg-[#FEF3C7]' },
  NO_SHOW_ADMIN: { label: 'Professor ausente', color: 'text-[#D97706]', bg: 'bg-[#FEF3C7]' },
  INTERRUPTED: { label: 'Interrompida', color: 'text-[#D97706]', bg: 'bg-[#FEF3C7]' },
  RESCHEDULE_PENDING: { label: 'Reagendamento pendente', color: 'text-[#6366F1]', bg: 'bg-[#EEF2FF]' },
};

export const CREDIT_TYPE_MAP: Record<CreditType, { label: string; count: number }> = {
  SINGLE: { label: 'Aula avulsa', count: 1 },
  PACK_5: { label: 'Pack 5 aulas', count: 5 },
  PACK_10: { label: 'Pack 10 aulas', count: 10 },
  MONTHLY: { label: 'Mensal 8 aulas', count: 8 },
  PROMO: { label: 'Promoção', count: 1 },
  MANUAL: { label: 'Manual', count: 1 },
  REFUND: { label: 'Reembolso', count: 1 },
};

export const FEEDBACK_DIMENSION_MAP: Record<FeedbackDimension, { label: string; icon: string }> = {
  LISTENING: { label: 'Compreensão oral', icon: '👂' },
  SPEAKING: { label: 'Fala', icon: '🗣️' },
  WRITING: { label: 'Escrita', icon: '✍️' },
  VOCABULARY: { label: 'Vocabulário', icon: '📚' },
};
