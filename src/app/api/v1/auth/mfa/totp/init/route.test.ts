// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// `@/lib/env` valida TODAS as env vars no import (a route importa apiResponse e
// signJWT de @/lib/auth, que importa env). Semeamos process.env antes de qualquer
// import de modulo (vi.hoisted roda antes das imports estaticas).
vi.hoisted(() => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'mysql://test:test@localhost:3306/test',
    JWT_SECRET: 'x'.repeat(32),
    JWT_EXPIRES_IN: '7d',
    CRON_SECRET: 'x'.repeat(16),
    HOCUSPOCUS_JWT_SECRET: 'x'.repeat(32),
    ENCRYPTION_KEY: 'x'.repeat(32),
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
    RESEND_API_KEY: 're_test_fake',
    EMAIL_FROM: 'noreply@corgly.test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    NEXT_PUBLIC_HOCUSPOCUS_URL: 'ws://localhost:1234',
  });
});

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  getMfaStatus: vi.fn(),
  initMfaEnrollment: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));

vi.mock('@/services/mfa.service', () => {
  class MfaError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.code = code;
    }
  }
  return {
    MfaError,
    MfaErrorCode: { USER_NOT_FOUND: 'MFA_USER_NOT_FOUND' },
    mfaService: {
      getMfaStatus: mocks.getMfaStatus,
      initMfaEnrollment: mocks.initMfaEnrollment,
    },
  };
});

vi.mock('@/lib/audit/audit-logger', () => ({ auditLog: mocks.auditLog }));

import { COOKIE_NAME, signJWT } from '@/lib/auth';
import { MfaError } from '@/services/mfa.service';
import { POST } from './route';

const ADMIN_ID = 'admin-1';

function buildRequest(opts: { role?: 'ADMIN' | 'STUDENT'; mfaAt?: number } = {}) {
  const role = opts.role ?? 'ADMIN';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': ADMIN_ID,
    'x-user-role': role,
    'x-token-version': '0',
  };
  if (opts.mfaAt !== undefined) {
    const token = signJWT({ sub: ADMIN_ID, role, version: 0, mfaAt: opts.mfaAt });
    headers.cookie = `${COOKIE_NAME}=${token}`;
  }
  return new NextRequest('http://localhost/api/v1/auth/mfa/totp/init', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
}

const ENROLLMENT = {
  secret: 'JBSWY3DPEHPK3PXP',
  otpauthUri: 'otpauth://totp/Corgly:admin?secret=JBSWY3DPEHPK3PXP&issuer=Corgly',
  recoveryCodes: ['AAAA-BBBB-CCCC', 'DDDD-EEEE-FFFF'],
};

const nowSec = () => Math.floor(Date.now() / 1000);

describe('POST /api/v1/auth/mfa/totp/init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ id: ADMIN_ID, role: 'ADMIN', tokenVersion: 0 });
    mocks.initMfaEnrollment.mockResolvedValue(ENROLLMENT);
    mocks.auditLog.mockResolvedValue(undefined);
  });

  it('status NONE: inicia o cadastro apenas com a sessao de senha (200)', async () => {
    mocks.getMfaStatus.mockResolvedValue({ status: 'NONE', enabled: false, confirmedAt: null, recoveryCodesRemaining: 0 });
    const res = await POST(buildRequest(), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.secret).toBe(ENROLLMENT.secret);
    expect(body.data.recoveryCodes).toHaveLength(2);
    expect(mocks.initMfaEnrollment).toHaveBeenCalledWith(ADMIN_ID);
    expect(mocks.auditLog).toHaveBeenCalledWith(
      'ADMIN_MFA_ENROLL_INIT',
      { type: 'User', id: ADMIN_ID },
      ADMIN_ID,
      { recoveryCodesIssued: 2 },
    );
  });

  it('status PENDING: permite reiniciar sem MFA recente (200)', async () => {
    mocks.getMfaStatus.mockResolvedValue({ status: 'PENDING', enabled: false, confirmedAt: null, recoveryCodesRemaining: 0 });
    const res = await POST(buildRequest(), {});
    expect(res.status).toBe(200);
    expect(mocks.initMfaEnrollment).toHaveBeenCalledTimes(1);
  });

  it('status ACTIVE sem mfaAt: 403 mfa_required e NAO regenera o segredo', async () => {
    mocks.getMfaStatus.mockResolvedValue({ status: 'ACTIVE', enabled: true, confirmedAt: '2026-01-01T00:00:00.000Z', recoveryCodesRemaining: 8 });
    const res = await POST(buildRequest(), {});
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('mfa_required');
    expect(body.error).toMatch(/MFA recente/);
    expect(mocks.initMfaEnrollment).not.toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalledWith(
      'ADMIN_MFA_CHALLENGE_REQUIRED',
      { type: 'User', id: ADMIN_ID },
      ADMIN_ID,
      expect.objectContaining({ reason: 'mfa_stale_or_absent' }),
    );
  });

  it('status ACTIVE com mfaAt expirado (> 15 min): 403 mfa_required', async () => {
    mocks.getMfaStatus.mockResolvedValue({ status: 'ACTIVE', enabled: true, confirmedAt: '2026-01-01T00:00:00.000Z', recoveryCodesRemaining: 8 });
    const res = await POST(buildRequest({ mfaAt: nowSec() - 901 }), {});
    expect(res.status).toBe(403);
    expect(mocks.initMfaEnrollment).not.toHaveBeenCalled();
  });

  it('status ACTIVE com mfaAt recente: regenera (200)', async () => {
    mocks.getMfaStatus.mockResolvedValue({ status: 'ACTIVE', enabled: true, confirmedAt: '2026-01-01T00:00:00.000Z', recoveryCodesRemaining: 8 });
    const res = await POST(buildRequest({ mfaAt: nowSec() - 30 }), {});
    expect(res.status).toBe(200);
    expect(mocks.initMfaEnrollment).toHaveBeenCalledWith(ADMIN_ID);
  });

  it('nao-admin: 403 antes de consultar o status', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: ADMIN_ID, role: 'STUDENT', tokenVersion: 0 });
    const res = await POST(buildRequest({ role: 'STUDENT' }), {});
    expect(res.status).toBe(403);
    expect(mocks.getMfaStatus).not.toHaveBeenCalled();
  });

  it('usuario removido entre auth e enrollment: 404', async () => {
    mocks.getMfaStatus.mockResolvedValue({ status: 'NONE', enabled: false, confirmedAt: null, recoveryCodesRemaining: 0 });
    mocks.initMfaEnrollment.mockRejectedValue(new MfaError('MFA_USER_NOT_FOUND'));
    const res = await POST(buildRequest(), {});
    expect(res.status).toBe(404);
  });
});
