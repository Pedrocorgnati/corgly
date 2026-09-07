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

function apiReq(path: string, method = 'GET') {
  return new NextRequest(`http://localhost${path}`, { method });
}

// O proxy repassa contexto via NextResponse.next({ request: { headers } }); o Next
// serializa cada override como `x-middleware-request-<header>` na resposta.
function forwarded(res: Response, header: string) {
  return res.headers.get(`x-middleware-request-${header}`);
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

describe('proxy: allowlist de /api/v1/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockCheckRateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 1000 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('GET sem sessao continua publico e nao recebe headers internos', async () => {
    mockGetPayload.mockReturnValue(null);
    const res = await proxy(apiReq('/api/v1/availability?date=2030-06-15', 'GET'));
    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-user-id')).toBeNull();
  });

  it.each([
    ['POST', '/api/v1/availability'],
    ['PATCH', '/api/v1/availability/slot-1/block'],
    ['PATCH', '/api/v1/availability/slot-1/unblock'],
    ['DELETE', '/api/v1/availability/slot-1'],
  ])('%s %s sem sessao -> 401', async (method, path) => {
    mockGetPayload.mockReturnValue(null);
    const res = await proxy(apiReq(path, method));
    expect(res.status).toBe(401);
  });

  it.each([
    ['POST', '/api/v1/availability'],
    ['PATCH', '/api/v1/availability/slot-1/block'],
    ['PATCH', '/api/v1/availability/slot-1/unblock'],
    ['DELETE', '/api/v1/availability/slot-1'],
  ])('%s %s com sessao de admin atravessa com os tres headers', async (method, path) => {
    mockGetPayload.mockReturnValue({ sub: 'a1', role: 'ADMIN', version: 0 });
    const res = await proxy(apiReq(path, method));
    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-user-id')).toBe('a1');
    expect(forwarded(res, 'x-user-role')).toBe('ADMIN');
    expect(forwarded(res, 'x-token-version')).toBe('0');
  });

  it('POST com sessao de aluno atravessa o proxy (o 403 nasce no requireAdmin da rota)', async () => {
    mockGetPayload.mockReturnValue({ sub: 'u1', role: 'STUDENT', version: 0 });
    const res = await proxy(apiReq('/api/v1/availability', 'POST'));
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-user-id')).toBe('u1');
    expect(forwarded(res, 'x-user-role')).toBe('STUDENT');
  });
});

describe('proxy: allowlist do pedido de magic-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockCheckRateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 1000 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('deslogado alcanca POST /api/v1/auth/magic-link/request sem headers internos', async () => {
    mockGetPayload.mockReturnValue(null);
    const res = await proxy(apiReq('/api/v1/auth/magic-link/request', 'POST'));
    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-user-id')).toBeNull();
    expect(forwarded(res, 'x-user-role')).toBeNull();
  });

  it.each([
    '/api/v1/auth/me',
    '/api/v1/auth/logout',
    // O namespace pai NAO entrou na lista: so o caminho completo do pedido e
    // publico, entao rota futura sob /magic-link continua exigindo sessao.
    '/api/v1/auth/magic-link',
    '/api/v1/auth/magic-link/consume',
  ])('vizinha protegida %s sem sessao -> 401', async (path) => {
    mockGetPayload.mockReturnValue(null);
    const res = await proxy(apiReq(path, 'POST'));
    expect(res.status).toBe(401);
  });
});
