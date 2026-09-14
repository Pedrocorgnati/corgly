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
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const RefundRequestStatus = {
  PENDING: 'PENDING',
  STRIPE_PROCESSING: 'STRIPE_PROCESSING',
  STRIPE_FAILED: 'STRIPE_FAILED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type RefundRequestStatus =
  (typeof RefundRequestStatus)[keyof typeof RefundRequestStatus];

export const SubscriptionStatus = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
  PAST_DUE: 'PAST_DUE',
  PAUSED: 'PAUSED',
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
  VIDEO: 'VIDEO',
  ARTICLE: 'ARTICLE',
} as const;
export type ContentType = (typeof ContentType)[keyof typeof ContentType];

// Captação pública de leads (§12.4.3) - origem do formulário que gerou o lead.
export const LeadOrigin = {
  LANDING: 'LANDING',
  METHOD: 'METHOD',
  CONTACT: 'CONTACT',
} as const;
export type LeadOrigin = (typeof LeadOrigin)[keyof typeof LeadOrigin];

export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  CONVERTED: 'CONVERTED',
  SPAM: 'SPAM',
  ARCHIVED: 'ARCHIVED',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const CreditEventType = {
  PURCHASE: 'PURCHASE',
  CONSUMED: 'CONSUMED',
  REFUNDED: 'REFUNDED',
  EXPIRED: 'EXPIRED',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
} as const;
export type CreditEventType = (typeof CreditEventType)[keyof typeof CreditEventType];

export const EmailType = {
  CONFIRM_EMAIL: 'CONFIRM_EMAIL',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_REMINDER_24H: 'BOOKING_REMINDER_24H',
  BOOKING_REMINDER_1H: 'BOOKING_REMINDER_1H',
  PASSWORD_RESET: 'PASSWORD_RESET',
  CREDIT_EXPIRY_WARNING: 'CREDIT_EXPIRY_WARNING',
  PAYMENT_RECEIPT: 'PAYMENT_RECEIPT',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  BULK_CANCEL_NOTIFICATION: 'BULK_CANCEL_NOTIFICATION',
  // Added by NOTIFICATION-SPEC (Module 2 gap)
  PURCHASE_CONFIRMED: 'PURCHASE_CONFIRMED',
  SUBSCRIPTION_PAYMENT_FAILED: 'SUBSCRIPTION_PAYMENT_FAILED',
  SESSION_INTERRUPTED: 'SESSION_INTERRUPTED',
  RECURRING_BOOKING_FAILED: 'RECURRING_BOOKING_FAILED',
  ACCOUNT_DELETION_REQUESTED: 'ACCOUNT_DELETION_REQUESTED',
  DATA_EXPORT_READY: 'DATA_EXPORT_READY',
  // Added by module-9-integration (CONTRACT-02 gap)
  FEEDBACK_AVAILABLE: 'FEEDBACK_AVAILABLE',
  // Added by module-9-integration ST008 (reagendamento aprovado)
  BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
  // Added by T-045 (magic-link / login sem senha)
  MAGIC_LINK: 'MAGIC_LINK',
  // Added by T-055 (AD-33: broadcasts de marketing + logs de envio em massa)
  MARKETING_BROADCAST: 'MARKETING_BROADCAST',
  // Added by 025 (conflito entre ocupacao externa e aula ja vendida)
  EXTERNAL_BUSY_CONFLICT: 'EXTERNAL_BUSY_CONFLICT',
} as const;
export type EmailType = (typeof EmailType)[keyof typeof EmailType];

export const PackageType = {
  SINGLE: 'SINGLE',
  PACK_5: 'PACK_5',
  PACK_10: 'PACK_10',
  MONTHLY: 'MONTHLY',
  PROMO: 'PROMO',
} as const;
export type PackageType = (typeof PackageType)[keyof typeof PackageType];

// ── Status Maps (status → cor) e chaves de rotulo (status → catalogo i18n) ──

/**
 * Cor de cada status de sessao. O ROTULO nao mora aqui de proposito: este
 * modulo e uma constante de `src/lib` sem acesso ao catalogo do next-intl,
 * entao qualquer texto escrito aqui ficaria congelado num idioma so — foi o
 * que aconteceu ate esta rodada (nove rotulos pt-BR renderizados tambem para
 * en-US, es-ES e it-IT). O texto vive no catalogo, e a ponte ate ele e
 * `SESSION_STATUS_LABEL_KEY`.
 */
export const SESSION_STATUS_MAP: Record<SessionStatus, { color: string; bg: string }> = {
  SCHEDULED: { color: 'text-[#0284C7]', bg: 'bg-[#E0F2FE]' },
  IN_PROGRESS: { color: 'text-[#059669]', bg: 'bg-[#D1FAE5]' },
  COMPLETED: { color: 'text-[#6B7280]', bg: 'bg-[#F3F4F6]' },
  CANCELLED_BY_STUDENT: { color: 'text-[#DC2626]', bg: 'bg-[#FEE2E2]' },
  CANCELLED_BY_ADMIN: { color: 'text-[#DC2626]', bg: 'bg-[#FEE2E2]' },
  NO_SHOW_STUDENT: { color: 'text-[#D97706]', bg: 'bg-[#FEF3C7]' },
  NO_SHOW_ADMIN: { color: 'text-[#D97706]', bg: 'bg-[#FEF3C7]' },
  INTERRUPTED: { color: 'text-[#D97706]', bg: 'bg-[#FEF3C7]' },
  RESCHEDULE_PENDING: { color: 'text-[#6366F1]', bg: 'bg-[#EEF2FF]' },
};

/**
 * Chave do rotulo de cada status dentro do namespace `sessionStatus` do
 * catalogo. Consumir SEMPRE como `t(SESSION_STATUS_LABEL_KEY[status])` com
 * `useTranslations('sessionStatus')` (ou `getTranslations` no server).
 *
 * O mapa e NOMEADO e literal de proposito: a guarda estatica de i18n
 * (`src/__tests__/i18n/_message-scan.ts`) sabe expandir `t(MAPA[x])` para os
 * nove valores e cobrar cada um dos quatro catalogos. Trocar isto por
 * `t(status)` cru devolveria o site para o balde "NAO VERIFICAVEL" e uma
 * chave removida do catalogo voltaria a passar verde.
 *
 * Consumidores: `src/app/(student)/history/history-client.tsx`,
 * `src/components/session/SessionList.tsx`,
 * `src/components/admin/AdminCalendar.tsx`,
 * `src/components/calendar/RescheduleRequestBadge.tsx`,
 * `src/components/ui/session-card.tsx`,
 * `src/app/(admin)/admin/sessions/[id]/page.tsx`.
 */
export const SESSION_STATUS_LABEL_KEY: Record<SessionStatus, string> = {
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED_BY_STUDENT: 'CANCELLED_BY_STUDENT',
  CANCELLED_BY_ADMIN: 'CANCELLED_BY_ADMIN',
  NO_SHOW_STUDENT: 'NO_SHOW_STUDENT',
  NO_SHOW_ADMIN: 'NO_SHOW_ADMIN',
  INTERRUPTED: 'INTERRUPTED',
  RESCHEDULE_PENDING: 'RESCHEDULE_PENDING',
};

/**
 * Chave do rotulo de cada tipo de credito dentro do namespace `creditType`.
 * Mesma regra do mapa de status: consumir como
 * `t(CREDIT_TYPE_LABEL_KEY[tipo])`.
 *
 * Consumidor: `src/components/admin/credit-log.tsx`.
 */
export const CREDIT_TYPE_LABEL_KEY: Record<CreditType, string> = {
  SINGLE: 'SINGLE',
  PACK_5: 'PACK_5',
  PACK_10: 'PACK_10',
  MONTHLY: 'MONTHLY',
  PROMO: 'PROMO',
  MANUAL: 'MANUAL',
  REFUND: 'REFUND',
};

// ── Exercícios (biblioteca do admin) ──

export const ExerciseStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ExerciseStatus = (typeof ExerciseStatus)[keyof typeof ExerciseStatus];

export const ExerciseAssignmentStatus = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
} as const;
export type ExerciseAssignmentStatus =
  (typeof ExerciseAssignmentStatus)[keyof typeof ExerciseAssignmentStatus];

export const ExerciseAttemptStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  ABANDONED: 'ABANDONED',
} as const;
export type ExerciseAttemptStatus =
  (typeof ExerciseAttemptStatus)[keyof typeof ExerciseAttemptStatus];

export const ExerciseItemKind = {
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  MATCH_CLICK: 'MATCH_CLICK',
  AUDIO_WORD: 'AUDIO_WORD',
  AUDIO_CLOZE: 'AUDIO_CLOZE',
  AUDIO_SENTENCE: 'AUDIO_SENTENCE',
  AUDIO_CHOICE: 'AUDIO_CHOICE',
  AUDIO_ORDER: 'AUDIO_ORDER',
  TEXT_CHOICE: 'TEXT_CHOICE',
  VERB_CLOZE: 'VERB_CLOZE',
  IMAGE_WORD: 'IMAGE_WORD',
  IMAGE_CHOICE: 'IMAGE_CHOICE',
  IMAGE_SPEAK: 'IMAGE_SPEAK',
  AUDIO_SHADOW: 'AUDIO_SHADOW',
  L1_SPEAK_PT: 'L1_SPEAK_PT',
} as const;
export type ExerciseItemKind = (typeof ExerciseItemKind)[keyof typeof ExerciseItemKind];

/**
 * Cor/rotulo de cada status de exercicio. Decisao da task 006 (ST006, opcao a):
 * mapa PROPRIO ao lado do `SESSION_STATUS_MAP`, sem generalizar o `StatusBadge`
 * — aquele e tipado em `SessionStatus` e tem 9 consumers de sessao que nao
 * deveriam ser tocados por uma tela nova.
 *
 * O rotulo e pt-BR de proposito: a area admin inteira (ex.
 * `admin/students/page.tsx`) escreve copy direto em pt-BR, sem catalogo
 * next-intl. Se a area admin for i18n-izada um dia, este mapa ganha um
 * `EXERCISE_STATUS_LABEL_KEY` espelhando o padrao de sessao.
 *
 * Consumidor: `src/app/(admin)/admin/exercises/page.tsx`.
 */
export const EXERCISE_STATUS_MAP: Record<
  ExerciseStatus,
  { color: string; bg: string; border: string; label: string }
> = {
  DRAFT: {
    color: 'text-[#D97706]',
    bg: 'bg-[#FEF3C7]',
    border: 'border-[#FDE68A]',
    label: 'Rascunho',
  },
  PUBLISHED: {
    color: 'text-[#059669]',
    bg: 'bg-[#D1FAE5]',
    border: 'border-[#A7F3D0]',
    label: 'Publicado',
  },
  ARCHIVED: {
    color: 'text-[#6B7280]',
    bg: 'bg-[#F3F4F6]',
    border: 'border-[#E5E7EB]',
    label: 'Arquivado',
  },
};

/**
 * Mapa de nível do exercício (1-5). Usado na tela de assignments para
 * exibir o nível com cor correspondente.
 *
 * Consumidor: `src/components/admin/exercises/assignment-list.tsx`.
 */
export const LEVEL_MAP: Record<number, { color: string; bg: string; border: string }> = {
  1: { color: 'text-[#059669]', bg: 'bg-[#D1FAE5]', border: 'border-[#A7F3D0]' },
  2: { color: 'text-[#0891B2]', bg: 'bg-[#CFFAFE]', border: 'border-[#A5F3FC]' },
  3: { color: 'text-[#0284C7]', bg: 'bg-[#E0F2FE]', border: 'border-[#BAE6FD]' },
  4: { color: 'text-[#7C3AED]', bg: 'bg-[#EDE9FE]', border: 'border-[#DDD6FE]' },
  5: { color: 'text-[#DC2626]', bg: 'bg-[#FEE2E2]', border: 'border-[#FECACA]' },
};
