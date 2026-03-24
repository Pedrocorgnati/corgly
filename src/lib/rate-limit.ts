/**
 * Rate limiter distribuído para Next.js API routes.
 * Usa @upstash/ratelimit com Redis para estado consistente entre instâncias.
 *
 * Variáveis obrigatórias (produção):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Fallback: se Redis não configurado, permite todas as requests e loga aviso.
 *
 * Rate limits do LLD:
 *   POST /auth/login           → 10 req / 1 min / IP
 *   POST /auth/register        → 5 req / 1 min / IP
 *   POST /auth/forgot-password → 3 req / 15 min / IP
 *   POST /sessions             → 20 req / 1 min / userId
 *   POST /webhooks/stripe      → 100 req / 1 min / IP
 *   GET  /**                   → 100 req / 1 min / userId
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  AUTH_LOGIN:      { maxRequests: 10,  windowMs: 60_000 },
  AUTH_REGISTER:   { maxRequests: 5,   windowMs: 60_000 },
  AUTH_FORGOT:     { maxRequests: 3,   windowMs: 15 * 60_000 },
  AUTH_RESEND:     { maxRequests: 3,   windowMs: 15 * 60_000 },
  SESSIONS_CREATE: { maxRequests: 20,  windowMs: 60_000 },
  SIGNAL_POST:     { maxRequests: 60,  windowMs: 60_000 },  // WebRTC signaling POST
  SIGNAL_GET:      { maxRequests: 120, windowMs: 60_000 },  // WebRTC signaling GET (polling 2s)
  WEBHOOK:         { maxRequests: 100, windowMs: 60_000 },
  GENERAL:         { maxRequests: 100, windowMs: 60_000 },
} as const;

// ---------------------------------------------------------------------------
// Redis client — lazy, só instancia se env vars estiverem presentes
// ---------------------------------------------------------------------------

let redisClient: Redis | null = null;
let redisChecked = false;

function getRedis(): Redis | null {
  if (redisChecked) return redisClient;
  redisChecked = true;

  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (env.NODE_ENV === 'production') {
      console.warn(
        '[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN não configurados — rate limiting desativado. ' +
        'Configure as variáveis para habilitar rate limiting distribuído.',
      );
    }
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

// Cache de limiters por windowMs
const limiterCache = new Map<number, Ratelimit>();

function getLimiter(config: RateLimitConfig): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;

  const cached = limiterCache.get(config.windowMs);
  if (cached) return cached;

  const windowSeconds = Math.ceil(config.windowMs / 1000);
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(config.maxRequests, `${windowSeconds} s`),
    analytics: false,
    prefix: '@corgly/rl',
  });

  limiterCache.set(config.windowMs, limiter);
  return limiter;
}

// ---------------------------------------------------------------------------
// checkRateLimit — interface pública
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const limiter = getLimiter(config);

  if (!limiter) {
    // Redis não configurado — fail open
    return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
  }

  try {
    const identifier = `${config.maxRequests}:${config.windowMs}:${key}`;
    const result = await limiter.limit(identifier);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
    };
  } catch (err) {
    // Falha no Redis → fail open e loga erro
    console.error('[rate-limit] Redis error, allowing request:', err);
    return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
  }
}
