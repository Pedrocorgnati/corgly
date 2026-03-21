import type { UserRole, SessionStatus, CreditType, CreditStatus, FeedbackDimension } from './constants/enums';

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
export interface Session extends BaseEntity {
  studentId: string;
  student?: Pick<User, 'id' | 'name' | 'email' | 'timezone'>;
  scheduledAt: string; // UTC ISO
  durationMinutes: number;
  status: SessionStatus;
  creditBatchId?: string;
  documentId?: string;
  feedbackId?: string;
  rtcState?: 'WAITING' | 'CONNECTED' | 'ENDED';
}

// ── Credit ──
export interface Credit extends BaseEntity {
  studentId: string;
  type: CreditType;
  status: CreditStatus;
  quantity: number;
  usedQuantity: number;
  expiresAt: string;
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
