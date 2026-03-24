// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
          timezone: 'America/Sao_Paulo',
          termsAccepted: true,
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
          timezone: 'America/Sao_Paulo',
          termsAccepted: true,
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

import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

describe('rateLimiting — checkRateLimit (AUTH_006, RATE_001)', () => {
  it('should allow requests up to the max limit', () => {
    const key = `test-login-allow-${Date.now()}`;
    for (let i = 0; i < RATE_LIMITS.AUTH_LOGIN.maxRequests; i++) {
      const result = checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN);
      expect(result.allowed).toBe(true);
    }
  });

  it('should block the 11th login attempt — AUTH_006', () => {
    const key = `test-login-block-${Date.now()}`;
    // Exhaust 10 allowed requests
    for (let i = 0; i < RATE_LIMITS.AUTH_LOGIN.maxRequests; i++) {
      checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN);
    }
    // 11th attempt should be blocked
    const result = checkRateLimit(key, RATE_LIMITS.AUTH_LOGIN);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should block the 4th forgot-password attempt (max is 3)', () => {
    const key = `test-forgot-${Date.now()}`;
    for (let i = 0; i < RATE_LIMITS.AUTH_FORGOT.maxRequests; i++) {
      checkRateLimit(key, RATE_LIMITS.AUTH_FORGOT);
    }
    const result = checkRateLimit(key, RATE_LIMITS.AUTH_FORGOT);
    expect(result.allowed).toBe(false);
  });

  it('should block the 101st general request — RATE_001', () => {
    const key = `test-general-${Date.now()}`;
    for (let i = 0; i < RATE_LIMITS.GENERAL.maxRequests; i++) {
      checkRateLimit(key, RATE_LIMITS.GENERAL);
    }
    const result = checkRateLimit(key, RATE_LIMITS.GENERAL);
    expect(result.allowed).toBe(false);
  });

  it('should reset rate limit counter after window expires', async () => {
    const key = `test-reset-${Date.now()}`;
    const shortLimit = { maxRequests: 2, windowMs: 50 }; // 50ms window
    checkRateLimit(key, shortLimit);
    checkRateLimit(key, shortLimit);
    expect(checkRateLimit(key, shortLimit).allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));
    const result = checkRateLimit(key, shortLimit);
    expect(result.allowed).toBe(true);
  });
});
