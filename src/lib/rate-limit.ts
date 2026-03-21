/**
 * Simple in-memory rate limiter for Next.js API routes.
 * For production, replace with Redis-backed solution (e.g., @upstash/ratelimit).
 *
 * Rate limits from LLD:
 *   POST /auth/login         → 10 req / 1 min / IP
 *   POST /auth/register      → 5 req / 1 min / IP
 *   POST /auth/forgot-password → 3 req / 15 min / IP
 *   POST /sessions           → 20 req / 1 min / userId
 *   POST /webhooks/stripe    → 100 req / 1 min / IP
 *   GET  /**                 → 100 req / 1 min / userId
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  AUTH_LOGIN: { maxRequests: 10, windowMs: 60_000 },
  AUTH_REGISTER: { maxRequests: 5, windowMs: 60_000 },
  AUTH_FORGOT: { maxRequests: 3, windowMs: 15 * 60_000 },
  SESSIONS_CREATE: { maxRequests: 20, windowMs: 60_000 },
  WEBHOOK: { maxRequests: 100, windowMs: 60_000 },
  GENERAL: { maxRequests: 100, windowMs: 60_000 },
} as const;

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 5 * 60_000);
}
