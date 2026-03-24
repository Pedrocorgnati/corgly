// @vitest-environment node
/**
 * ST004 — Rate Limiting (AUTH_006, RATE_001)
 * Testa checkRateLimit diretamente e via endpoint de login.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { NextRequest } from 'next/server';

// ── Mock prisma para testes de endpoint ──────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/services/auth.service', () => ({
  authService: {
    login: vi.fn(),
  },
}));

// ── checkRateLimit unit tests ────────────────────────────────────────────────

describe('checkRateLimit — unit (AUTH_006, RATE_001)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('permite as primeiras N requisições dentro da janela', () => {
    const key = `test-allow-${Date.now()}`;
    for (let i = 0; i < RATE_LIMITS.AUTH_LOGIN.maxRequests; i++) {
      const result = checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN);
      expect(result.allowed).toBe(true);
    }
  });

  it('bloqueia a N+1ª requisição — AUTH_006', () => {
    const key = `test-block-${Date.now()}`;
    // Consume all allowed slots
    for (let i = 0; i < RATE_LIMITS.AUTH_LOGIN.maxRequests; i++) {
      checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN);
    }
    // 11th attempt should be blocked
    const result = checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('reseta o contador após a janela de tempo expirar', () => {
    const key = `test-reset-${Date.now()}`;
    // Fill up the limit
    for (let i = 0; i < RATE_LIMITS.AUTH_LOGIN.maxRequests; i++) {
      checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN);
    }
    // Blocked
    expect(checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN).allowed).toBe(false);

    // Advance time past window
    vi.advanceTimersByTime(RATE_LIMITS.AUTH_LOGIN.windowMs + 100);

    // Should be allowed again (new window)
    const result = checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN);
    expect(result.allowed).toBe(true);
  });

  it('bloqueia forgot-password na 4ª tentativa em 15min — AUTH_006', () => {
    const key = `forgot-${Date.now()}`;
    for (let i = 0; i < RATE_LIMITS.AUTH_FORGOT.maxRequests; i++) {
      const r = checkRateLimit(key, RATE_LIMITS.AUTH_FORGOT);
      expect(r.allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, RATE_LIMITS.AUTH_FORGOT);
    expect(blocked.allowed).toBe(false);
  });

  it('bloqueia rota geral após 101 requisições — RATE_001', () => {
    const key = `general-${Date.now()}`;
    for (let i = 0; i < RATE_LIMITS.GENERAL.maxRequests; i++) {
      checkRateLimit(key, RATE_LIMITS.GENERAL);
    }
    const blocked = checkRateLimit(key, RATE_LIMITS.GENERAL);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('chaves diferentes não interferem entre si', () => {
    const key1 = `isolated-1-${Date.now()}`;
    const key2 = `isolated-2-${Date.now()}`;

    // Fill key1 completely
    for (let i = 0; i < RATE_LIMITS.AUTH_LOGIN.maxRequests; i++) {
      checkRateLimit(key1, RATE_LIMITS.AUTH_LOGIN);
    }
    expect(checkRateLimit(key1, RATE_LIMITS.AUTH_LOGIN).allowed).toBe(false);

    // key2 is unaffected
    const key2Result = checkRateLimit(key2, RATE_LIMITS.AUTH_LOGIN);
    expect(key2Result.allowed).toBe(true);
    expect(key2Result.remaining).toBe(RATE_LIMITS.AUTH_LOGIN.maxRequests - 1);
  });
});

// ── Endpoint integration: login 429 quando rate limit excedido ───────────────

describe('POST /api/v1/auth/login — rate limiting integrado (AUTH_006)', () => {
  const { authService } = await import('@/services/auth.service').catch(() => ({
    authService: { login: vi.fn() },
  })) as { authService: { login: ReturnType<typeof vi.fn> } };

  it('retorna 429 após exceder o limite de tentativas de login', async () => {
    const ip = `1.2.3.${Math.floor(Math.random() * 255)}`;

    // Override checkRateLimit to simulate blocked state
    vi.doMock('@/lib/rate-limit', () => ({
      checkRateLimit: vi.fn().mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 }),
      RATE_LIMITS,
    }));

    // Re-import to pick up new mock
    const { POST } = await import('@/app/api/v1/auth/login/route');
    const req = new NextRequest('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@test.com', password: 'password123' }),
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': ip,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});
