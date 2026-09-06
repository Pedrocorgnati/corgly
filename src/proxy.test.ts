// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetPayload = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  getPayloadFromRequest: mockGetPayload,
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));

vi.mock('@/lib/rate-limit', () => {
  const cfg = { maxRequests: 60, windowMs: 60_000 };
  return {
    RATE_LIMITS: {
      GENERAL: cfg,
      AUTH_LOGIN: cfg,
      AUTH_FORGOT: cfg,
      AUTH_REGISTER: cfg,
      AUTH_RESEND: cfg,
    },
    checkRateLimit: mockCheckRateLimit,
  };
});

import { proxy } from './proxy';

function req(path: string) {
  return new NextRequest(`http://localhost${path}`, { method: 'GET' });
}

const nowSec = () => Math.floor(Date.now() / 1000);

describe('proxy: gate de MFA admin (UI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockCheckRateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 1000 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('anonimo em /admin/* -> 307 para login com redirectTo', async () => {
    mockGetPayload.mockReturnValue(null);
    const res = await proxy(req('/admin/dashboard'));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/auth/login');
    expect(loc.searchParams.get('redirectTo')).toBe('/admin/dashboard');
  });

  it('STUDENT em /admin/* -> 307 para login (nunca challenge)', async () => {
    mockGetPayload.mockReturnValue({ sub: 'u1', role: 'STUDENT', version: 0 });
    const res = await proxy(req('/admin/dashboard'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/auth/login');
  });

  it('ADMIN sem mfaAt -> 307 para challenge com redirectTo', async () => {
    mockGetPayload.mockReturnValue({ sub: 'a1', role: 'ADMIN', version: 0 });
    const res = await proxy(req('/admin/dashboard'));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/auth/mfa/challenge');
    expect(loc.searchParams.get('redirectTo')).toBe('/admin/dashboard');
  });

  it('ADMIN sem mfaAt: redirectTo preserva a query string do destino', async () => {
    mockGetPayload.mockReturnValue({ sub: 'a1', role: 'ADMIN', version: 0 });
    const res = await proxy(req('/admin/students?page=3&q=ana'));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/auth/mfa/challenge');
    expect(loc.searchParams.get('redirectTo')).toBe('/admin/students?page=3&q=ana');
  });

  it('ADMIN com mfaAt expirado (> 15 min) -> 307 para challenge', async () => {
    mockGetPayload.mockReturnValue({ sub: 'a1', role: 'ADMIN', version: 0, mfaAt: nowSec() - 901 });
    const res = await proxy(req('/admin/dashboard'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/auth/mfa/challenge');
  });

  it('ADMIN com mfaAt recente -> passa', async () => {
    mockGetPayload.mockReturnValue({ sub: 'a1', role: 'ADMIN', version: 0, mfaAt: nowSec() - 10 });
    const res = await proxy(req('/admin/dashboard'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('bypass de dev: ADMIN sem mfaAt passa com NODE_ENV=development + ADMIN_MFA_DEV_BYPASS=true', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_MFA_DEV_BYPASS', 'true');
    mockGetPayload.mockReturnValue({ sub: 'a1', role: 'ADMIN', version: 0 });
    const res = await proxy(req('/admin/dashboard'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('bypass de dev NAO vale fora de development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_MFA_DEV_BYPASS', 'true');
    mockGetPayload.mockReturnValue({ sub: 'a1', role: 'ADMIN', version: 0 });
    const res = await proxy(req('/admin/dashboard'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/auth/mfa/challenge');
  });

  it('bypass de dev NAO substitui o login: STUDENT continua barrado', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_MFA_DEV_BYPASS', 'true');
    mockGetPayload.mockReturnValue({ sub: 'u1', role: 'STUDENT', version: 0 });
    const res = await proxy(req('/admin/dashboard'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/auth/login');
  });

  it.each(['/auth/mfa/challenge', '/auth/mfa/setup', '/auth/login'])(
    '%s nunca e gateado (evita loop de redirect)',
    async (path) => {
      mockGetPayload.mockReturnValue({ sub: 'a1', role: 'ADMIN', version: 0 });
      const res = await proxy(req(path));
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    },
  );

  it('rotas publicas fora de /admin nao consultam o gate', async () => {
    mockGetPayload.mockReturnValue(null);
    const res = await proxy(req('/pt-BR'));
    expect(res.status).toBe(200);
  });
});
