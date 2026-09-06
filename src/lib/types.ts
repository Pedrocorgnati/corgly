import type { UserRole, CreditType, CreditStatus, FeedbackDimension } from './constants/enums';
import type { SessionWithMeta } from '@/types/session.types';

// ── Base ──
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// ── API Response envelope ──
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

// ── Pagination ──
export interface PaginationParams {
  page: number;
  limit: number;
  total: number;
}

// ── Timezone ──
export interface TimezoneInfo {
  timezone: string; // IANA string, e.g. "America/Sao_Paulo"
  utcOffset: number;
  displayName: string;
}

// ── Score Map ──
export type ScoreMap = {
  [K in FeedbackDimension]: number; // 1-5
};

// ── User ──
export interface User extends BaseEntity {
  name: string;
  email: string;
  role: UserRole;
  timezone: string;
  country: string;
  avatarUrl?: string;
  creditBalance: number;
  stripeCustomerId?: string;
  isFirstPurchase: boolean;
  streakCount: number;
  lastSessionAt?: string;
  emailVerified: boolean;
}

// ── Session ──
//
// Fonte unica de verdade: `SessionWithMeta` em src/types/session.types.ts, que
// espelha campo a campo o serializador `sessionToMeta`
// (src/services/session.service.ts) — o unico shape de sessao que a API emite.
//
// O shape legado que vivia aqui (`scheduledAt`, `durationMinutes`, `student`,
// `documentId`, `feedbackId`, `rtcState`) nunca saiu de nenhuma rota: era um
// contrato paralelo que competia com o canonico. Reexportamos em vez de
// duplicar para que so exista um lugar onde a sessao muda de forma.
export type { SessionWithMeta } from '@/types/session.types';

/** @deprecated Prefira importar `SessionWithMeta` de '@/types/session.types'. */
export type Session = SessionWithMeta;

// ── Credit ──
export interface Credit extends BaseEntity {
  studentId: string;
  type: CreditType;
  status: CreditStatus;
  quantity: number;
  usedQuantity: number;
  /** Nulo em lote sem validade (assinatura) — prisma/schema.prisma: `expiresAt DateTime?`. */
  expiresAt: string | null;
  stripePaymentIntentId?: string;
}

// ── Feedback ──
export interface Feedback extends BaseEntity {
  sessionId: string;
  studentId: string;
  scores: ScoreMap;
  qualitativeNote?: string;
  nextSteps?: string;
  isVisible: boolean;
}

// ── Auth ──
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  timezone: string;
  creditBalance: number;
}
