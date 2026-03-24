/**
 * @module lib
 * Barrel export de utilitários — Module 2: Shared Foundations
 *
 * CONTRATO: usar `import { cn, formatCurrency, ... } from '@/lib'`
 */

// Utils
export { cn } from './utils';
export { formatCurrency, formatCurrencyCompact } from './format-currency';
export { formatDatetime, formatDualTimezone, formatDatePtBR, formatDateTimePtBR } from './format-datetime';

// API
export { apiClient, ApiError } from './api-client';
export { handleApiError } from './handle-api-error';

// Auth (server-only)
export { signJWT, verifyJWT, hashPassword, comparePassword } from './auth';
export type { JwtPayload } from './auth';

// Prisma client (server-only)
export { prisma } from './prisma';

// Rate limit
export { checkRateLimit, RATE_LIMITS } from './rate-limit';
export type { RateLimitConfig } from './rate-limit';

// Types
export type {
  BaseEntity,
  ApiResponse,
  PaginationParams,
  TimezoneInfo,
  ScoreMap,
  User,
  Session,
  Credit,
  Feedback,
  AuthUser,
} from './types';

// Constants
export * from './constants';
