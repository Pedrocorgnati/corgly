// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '../auth.service';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    creditBatch: {
      findMany: vi.fn(),
    },
    cookieConsent: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock email service
vi.mock('@/services/email.service', () => ({
  emailService: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock auth lib
vi.mock('@/lib/auth', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-password'),
  comparePassword: vi.fn(),
  signJWT: vi.fn().mockReturnValue('mock-jwt-token'),
  apiResponse: (data: unknown, error?: string | null, message?: string | null) => ({
    data,
    error: error ?? null,
    message: message ?? null,
  }),
}));

// Mock auth-logger
vi.mock('@/lib/auth-logger', () => ({
  logAuthFailure: vi.fn(),
  logAuthSuccess: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { comparePassword } from '@/lib/auth';

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  creditBatch: { findMany: ReturnType<typeof vi.fn> };
  cookieConsent: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

const mockComparePassword = comparePassword as ReturnType<typeof vi.fn>;

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    vi.clearAllMocks();
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should create user when email is unique', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        name: 'Test',
        email: 'test@test.com',
        preferredLanguage: 'PT_BR',
      });

      await expect(
        service.register({
          name: 'Test',
          email: 'test@test.com',
          password: 'Password1!',
          country: 'BR',
          timezone: 'America/Sao_Paulo',
          termsAccepted: true,
          privacyAccepted: true,
          marketingOptIn: false,
        }),
      ).resolves.toBeUndefined();

      expect(mockPrisma.user.create).toHaveBeenCalledOnce();
    });

    it('should throw EMAIL_ALREADY_EXISTS when email is taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing', email: 'test@test.com' });

      await expect(
        service.register({
          name: 'Test',
          email: 'test@test.com',
          password: 'Password1!',
          country: 'BR',
          timezone: 'America/Sao_Paulo',
          termsAccepted: true,
          privacyAccepted: true,
        }),
      ).rejects.toThrow('EMAIL_ALREADY_EXISTS');
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    const mockUser = {
      id: 'user-1',
      name: 'Test',
      email: 'test@test.com',
      passwordHash: 'hashed',
      emailConfirmed: true,
      deletionRequestedAt: null,
      tokenVersion: 0,
      role: 'STUDENT',
      onboardingCompletedAt: null,
      isFirstPurchase: true,
      preferredLanguage: 'PT_BR',
    };

    it('should return user and token on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(true);

      const result = await service.login({ email: 'test@test.com', password: 'Password1!' });

      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.id).toBe('user-1');
    });

    it('should throw INVALID_CREDENTIALS when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'notfound@test.com', password: 'Password1!' }),
      ).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('should throw INVALID_CREDENTIALS when password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@test.com', password: 'WrongPass1!' }),
      ).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('should throw EMAIL_NOT_CONFIRMED when email not confirmed', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, emailConfirmed: false });
      mockComparePassword.mockResolvedValue(true);

      await expect(
        service.login({ email: 'test@test.com', password: 'Password1!' }),
      ).rejects.toThrow('EMAIL_NOT_CONFIRMED');
    });

    it('should throw ACCOUNT_PENDING_DELETION when account is being deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        deletionRequestedAt: new Date(),
      });
      mockComparePassword.mockResolvedValue(true);

      await expect(
        service.login({ email: 'test@test.com', password: 'Password1!' }),
      ).rejects.toThrow('ACCOUNT_PENDING_DELETION');
    });
  });

  // ── confirmEmail ──────────────────────────────────────────────────────────

  describe('confirmEmail', () => {
    it('should confirm email with valid token', async () => {
      const future = new Date(Date.now() + 60_000);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        emailConfirmExpires: future,
      });
      mockPrisma.user.update.mockResolvedValue({});

      await expect(service.confirmEmail('valid-token')).resolves.toBeUndefined();
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailConfirmed: true }),
        }),
      );
    });

    it('should throw INVALID_TOKEN when token not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.confirmEmail('bad-token')).rejects.toThrow('INVALID_TOKEN');
    });

    it('should throw INVALID_TOKEN when token is expired', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        emailConfirmExpires: new Date(Date.now() - 1000), // past
      });
      await expect(service.confirmEmail('expired-token')).rejects.toThrow('INVALID_TOKEN');
    });
  });

  // ── resetPassword ─────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should reset password with valid token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      mockPrisma.user.update.mockResolvedValue({});

      await expect(service.resetPassword('valid-token', 'NewPass1!')).resolves.toBeUndefined();
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
        }),
      );
    });

    it('should throw INVALID_TOKEN when token not found or expired', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword('bad-token', 'NewPass1!')).rejects.toThrow('INVALID_TOKEN');
    });
  });

  // ── getMe ─────────────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('should return user data', async () => {
      const mockUser = { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'STUDENT' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getMe('user-1');
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const result = await service.getMe('non-existent');
      expect(result).toBeNull();
    });
  });

  // ── deleteAccount ─────────────────────────────────────────────────────────

  describe('deleteAccount', () => {
    const mockUser = {
      id: 'user-1',
      passwordHash: 'hashed',
      email: 'test@test.com',
      name: 'Test',
      preferredLanguage: 'PT_BR',
    };

    it('should set deletionRequestedAt with correct password and EXCLUIR confirmation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(true);
      mockPrisma.creditBatch.findMany.mockResolvedValue([]);
      mockPrisma.user.update.mockResolvedValue({});

      await expect(
        service.deleteAccount('user-1', { password: 'Password1!', confirmation: 'EXCLUIR' }),
      ).resolves.toBeUndefined();

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletionRequestedAt: expect.any(Date),
            tokenVersion: { increment: 1 },
          }),
        }),
      );
    });

    it('should throw INVALID_CREDENTIALS when password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(false);

      await expect(
        service.deleteAccount('user-1', { password: 'WrongPass!', confirmation: 'EXCLUIR' }),
      ).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('should throw ACTIVE_CREDITS when user has active credit batches', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockComparePassword.mockResolvedValue(true);
      mockPrisma.creditBatch.findMany.mockResolvedValue([{ id: 'batch-1' }]);

      await expect(
        service.deleteAccount('user-1', { password: 'Password1!', confirmation: 'EXCLUIR' }),
      ).rejects.toThrow('ACTIVE_CREDITS');
    });
  });

  // ── cancelDeletion ────────────────────────────────────────────────────────

  describe('cancelDeletion', () => {
    it('should clear deletionRequestedAt with valid token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        deletionCancellationExpires: new Date(Date.now() + 60_000),
      });
      mockPrisma.user.update.mockResolvedValue({});

      await expect(service.cancelDeletion('valid-token')).resolves.toBeUndefined();
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletionRequestedAt: null }),
        }),
      );
    });

    it('should throw INVALID_TOKEN when token is invalid or expired', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.cancelDeletion('bad-token')).rejects.toThrow('INVALID_TOKEN');
    });
  });

  // ── confirmEmail expiry (ST006 — AUTH_021) ────────────────────────────────

  describe('confirmEmail token hash and expiry (AUTH_021)', () => {
    it('should throw INVALID_TOKEN for hashed token not matching any user — AUTH_021', async () => {
      // DB search by hash returns null → invalid token
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.confirmEmail('completely-invalid-token')).rejects.toThrow('INVALID_TOKEN');
    });

    it('should throw INVALID_TOKEN when emailConfirmExpires is exactly now (expired) — AUTH_021', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        emailConfirmExpires: new Date(Date.now() - 1), // 1ms past
      });
      await expect(service.confirmEmail('expired-token')).rejects.toThrow('INVALID_TOKEN');
    });

    it('should store hash (not plaintext) by verifying findFirst is called with hashed token', async () => {
      const future = new Date(Date.now() + 60_000);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', emailConfirmExpires: future });
      mockPrisma.user.update.mockResolvedValue({});

      await service.confirmEmail('raw-token-abc123');

      // The service should have hashed 'raw-token-abc123' before DB lookup
      const callArg = mockPrisma.user.findFirst.mock.calls[0][0];
      const passedToken: string = callArg.where.emailConfirmToken;
      // Must NOT be the raw token
      expect(passedToken).not.toBe('raw-token-abc123');
      // Must be 64 hex chars (SHA256)
      expect(passedToken).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ── resetPassword expiry (ST006 — AUTH_022) ──────────────────────────────

  describe('resetPassword token expiry (AUTH_022)', () => {
    it('should throw INVALID_TOKEN when resetPasswordExpires is in the past — AUTH_022', async () => {
      // findFirst with { resetPasswordExpires: { gt: new Date() } } returns null
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword('expired-reset-token', 'NewPass1!')).rejects.toThrow('INVALID_TOKEN');
    });

    it('should throw INVALID_TOKEN for hashed token not matching any user — AUTH_022', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword('bad-token', 'NewPass1!')).rejects.toThrow('INVALID_TOKEN');
    });
  });
});

// ── validateToken / requireAuth (ST003 — AUTH_001) ───────────────────────────
// Tests for auth-guard.ts requireAuth — tokenVersion invalidation on password reset

import { requireAuth, requireAdmin } from '@/lib/auth-guard';
// Note: prisma mock is defined at the top of this file — no duplicate needed

function makeRequest(headers: Record<string, string>): import('next/server').NextRequest {
  const url = 'http://localhost/api/v1/test';
  return new NextRequest(url, { headers });
}

describe('requireAuth — tokenVersion validation (AUTH_001)', () => {
  // Re-use the top-level mockPrisma (already imported and typed above)
  const mockPrismaGuard = mockPrisma;

  beforeEach(() => vi.clearAllMocks());

  it('should return 401 when x-user-id header is missing', async () => {
    const req = makeRequest({ 'x-user-role': 'STUDENT', 'x-token-version': '0' });
    const result = await requireAuth(req);
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as import('next/server').NextResponse;
    expect(res.status).toBe(401);
  });

  it('should return 401 when x-token-version header is missing', async () => {
    const req = makeRequest({ 'x-user-id': 'user-1', 'x-user-role': 'STUDENT' });
    const result = await requireAuth(req);
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as import('next/server').NextResponse;
    expect(res.status).toBe(401);
  });

  it('should return 401 when user not found in DB', async () => {
    mockPrismaGuard.user.findUnique.mockResolvedValue(null);
    const req = makeRequest({ 'x-user-id': 'ghost', 'x-user-role': 'STUDENT', 'x-token-version': '0' });
    const result = await requireAuth(req);
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as import('next/server').NextResponse;
    expect(res.status).toBe(401);
  });

  it('should return 401 when tokenVersion is outdated — session invalidated after password reset (AUTH_001)', async () => {
    // User has tokenVersion=2 (after password reset), request carries version=1
    mockPrismaGuard.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'STUDENT', tokenVersion: 2 });
    const req = makeRequest({ 'x-user-id': 'user-1', 'x-user-role': 'STUDENT', 'x-token-version': '1' });
    const result = await requireAuth(req);
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as import('next/server').NextResponse;
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('invalidada');
  });

  it('should return AuthUser when tokenVersion matches DB — valid session', async () => {
    mockPrismaGuard.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'STUDENT', tokenVersion: 3 });
    const req = makeRequest({ 'x-user-id': 'user-1', 'x-user-role': 'STUDENT', 'x-token-version': '3' });
    const result = await requireAuth(req);
    expect(result).toEqual({ id: 'user-1', role: 'STUDENT', tokenVersion: 3 });
  });

  it('requireAdmin should return 403 when STUDENT tries admin route — AUTH_004', async () => {
    mockPrismaGuard.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'STUDENT', tokenVersion: 0 });
    const req = makeRequest({ 'x-user-id': 'user-1', 'x-user-role': 'STUDENT', 'x-token-version': '0' });
    const result = await requireAdmin(req);
    expect(result).toBeInstanceOf(NextResponse);
    const res = result as import('next/server').NextResponse;
    expect(res.status).toBe(403);
  });

  it('requireAdmin should return AuthUser for ADMIN with valid tokenVersion', async () => {
    mockPrismaGuard.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', tokenVersion: 1 });
    const req = makeRequest({ 'x-user-id': 'admin-1', 'x-user-role': 'ADMIN', 'x-token-version': '1' });
    const result = await requireAdmin(req);
    expect(result).toEqual({ id: 'admin-1', role: 'ADMIN', tokenVersion: 1 });
  });
});

// ── Rate limiting (ST005 — AUTH_006, RATE_001) ───────────────────────────────

/**
 * `checkRateLimit` deixou de ser um contador sincrono em memoria: hoje e
 * `async` e delega ao `@upstash/ratelimit` sobre Redis. Os casos abaixo pinam o
 * contrato REAL do modulo:
 *
 *  - sem `UPSTASH_REDIS_REST_URL/TOKEN` ele FALHA ABERTO (permite tudo);
 *  - com Redis, `allowed` espelha `result.success` e `remaining`/`resetAt` vem
 *    do limiter;
 *  - o identificador carrega `maxRequests:windowMs:key`, entao configs
 *    diferentes nao compartilham contador;
 *  - erro do Redis tambem falha aberto.
 *
 * `getRedis()` (via `redisChecked`) e `limiterCache` sao estado de MODULO, logo
 * cada caso re-importa `@/lib/rate-limit` apos `vi.resetModules()` para partir
 * de um estado limpo.
 */

// Handle compartilhado com a fabrica do mock (que e hoisted acima dos imports).
const upstashControl = vi.hoisted(() => ({ throwOnLimit: false }));

vi.mock('@upstash/redis', () => ({
  Redis: class FakeRedis {
    constructor(_config: unknown) {
      void _config;
    }
  },
}));

vi.mock('@upstash/ratelimit', () => {
  interface FakeWindow {
    max: number;
    windowMs: number;
  }

  class FakeRatelimit {
    private readonly window: FakeWindow;
    private readonly counters = new Map<string, { count: number; resetAt: number }>();

    constructor(opts: { limiter: FakeWindow }) {
      this.window = opts.limiter;
    }

    // O modulo chama `Ratelimit.slidingWindow(max, `${n} s`)`.
    static slidingWindow(max: number, window: string): FakeWindow {
      const [amount, unit] = window.split(' ');
      const factor = unit === 'm' ? 60_000 : 1_000;
      return { max, windowMs: Number(amount) * factor };
    }

    async limit(identifier: string) {
      if (upstashControl.throwOnLimit) throw new Error('redis unreachable');

      const now = Date.now();
      const previous = this.counters.get(identifier);
      const bucket =
        !previous || previous.resetAt <= now
          ? { count: 0, resetAt: now + this.window.windowMs }
          : previous;

      bucket.count += 1;
      this.counters.set(identifier, bucket);

      return {
        success: bucket.count <= this.window.max,
        remaining: Math.max(0, this.window.max - bucket.count),
        reset: bucket.resetAt,
      };
    }
  }

  return { Ratelimit: FakeRatelimit };
});

// `@/lib/env` congela o ambiente no import; o mock injeta as credenciais do
// Upstash apenas neste arquivo, sem tocar em `process.env` (que e compartilhado
// entre arquivos de teste no mesmo worker).
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      UPSTASH_REDIS_REST_URL: 'https://fake-upstash.test',
      UPSTASH_REDIS_REST_TOKEN: 'fake-upstash-token',
    },
  };
});

/** Re-importa o modulo com `limiterCache`/`redisChecked` zerados. */
async function freshRateLimit() {
  vi.resetModules();
  return import('@/lib/rate-limit');
}

describe('rateLimiting — checkRateLimit (AUTH_006, RATE_001)', () => {
  beforeEach(() => {
    upstashControl.throwOnLimit = false;
  });

  it('permite requests ate o limite e bloqueia a 11a tentativa de login — AUTH_006', async () => {
    const { checkRateLimit, RATE_LIMITS } = await freshRateLimit();
    const key = 'test-login';

    for (let i = 0; i < RATE_LIMITS.AUTH_LOGIN.maxRequests; i++) {
      const allowed = await checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN);
      expect(allowed.allowed).toBe(true);
    }

    const blocked = await checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('bloqueia a 4a tentativa de forgot-password (max 3)', async () => {
    const { checkRateLimit, RATE_LIMITS } = await freshRateLimit();
    const key = 'test-forgot';

    for (let i = 0; i < RATE_LIMITS.AUTH_FORGOT.maxRequests; i++) {
      expect((await checkRateLimit(key, RATE_LIMITS.AUTH_FORGOT)).allowed).toBe(true);
    }

    expect((await checkRateLimit(key, RATE_LIMITS.AUTH_FORGOT)).allowed).toBe(false);
  });

  it('bloqueia a 101a request geral — RATE_001', async () => {
    const { checkRateLimit, RATE_LIMITS } = await freshRateLimit();
    const key = 'test-general';

    for (let i = 0; i < RATE_LIMITS.GENERAL.maxRequests; i++) {
      expect((await checkRateLimit(key, RATE_LIMITS.GENERAL)).allowed).toBe(true);
    }

    expect((await checkRateLimit(key, RATE_LIMITS.GENERAL)).allowed).toBe(false);
  });

  it('mantem contadores separados por config (identifier carrega max:window:key)', async () => {
    const { checkRateLimit, RATE_LIMITS } = await freshRateLimit();
    const key = 'mesma-chave';

    // Esgota o balde de forgot-password (3/15min).
    for (let i = 0; i < RATE_LIMITS.AUTH_FORGOT.maxRequests; i++) {
      await checkRateLimit(key, RATE_LIMITS.AUTH_FORGOT);
    }
    expect((await checkRateLimit(key, RATE_LIMITS.AUTH_FORGOT)).allowed).toBe(false);

    // A MESMA chave em outra config continua liberada.
    expect((await checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN)).allowed).toBe(true);
  });

  it('reseta o contador depois que a janela expira', async () => {
    const { checkRateLimit } = await freshRateLimit();
    // O modulo converte a janela para segundos inteiros (`Math.ceil`), entao a
    // menor janela real e 1s — nao adianta pedir 50ms aqui.
    const shortLimit = { maxRequests: 2, windowMs: 1_000 };
    const key = 'test-reset';

    await checkRateLimit(key, shortLimit);
    await checkRateLimit(key, shortLimit);
    expect((await checkRateLimit(key, shortLimit)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect((await checkRateLimit(key, shortLimit)).allowed).toBe(true);
  });

  it('falha aberto quando o Redis lanca', async () => {
    const { checkRateLimit, RATE_LIMITS } = await freshRateLimit();
    upstashControl.throwOnLimit = true;

    const result = await checkRateLimit('test-redis-down', RATE_LIMITS.AUTH_LOGIN);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(RATE_LIMITS.AUTH_LOGIN.maxRequests);
  });

  it('falha aberto quando UPSTASH_REDIS_REST_URL/TOKEN nao estao configurados', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/env')>();
      return {
        ...actual,
        env: {
          ...actual.env,
          UPSTASH_REDIS_REST_URL: undefined,
          UPSTASH_REDIS_REST_TOKEN: undefined,
        },
      };
    });

    try {
      const { checkRateLimit, RATE_LIMITS } = await import('@/lib/rate-limit');
      // Sem Redis o limiter nem e criado: toda request passa.
      for (let i = 0; i < RATE_LIMITS.AUTH_LOGIN.maxRequests + 5; i++) {
        expect((await checkRateLimit('sem-redis', RATE_LIMITS.AUTH_LOGIN)).allowed).toBe(true);
      }
    } finally {
      vi.doUnmock('@/lib/env');
      vi.resetModules();
    }
  });
});
