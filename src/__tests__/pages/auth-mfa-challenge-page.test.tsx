import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  getAuthUser: vi.fn(),
  getMfaStatus: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  useRouter: () => mocks.router,
}));
vi.mock('@/lib/data/auth', () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock('@/services/mfa.service', () => ({ mfaService: { getMfaStatus: mocks.getMfaStatus } }));
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: vi.fn(), get: vi.fn() },
  ApiError: class ApiError extends Error {},
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import MfaChallengePage from '@/app/(public)/auth/mfa/challenge/page';

const ADMIN = { id: 'admin-1', role: 'ADMIN' };
const ACTIVE = { enabled: true, status: 'ACTIVE', confirmedAt: '2026-01-01T00:00:00.000Z', recoveryCodesRemaining: 8 };

function run(params: Record<string, string | string[] | undefined> = {}) {
  return MfaChallengePage({ searchParams: Promise.resolve(params) });
}

describe('/auth/mfa/challenge (server page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('anonimo: redireciona para o login preservando o redirectTo sanitizado', async () => {
    mocks.getAuthUser.mockResolvedValue(null);
    await expect(run({ redirectTo: '/admin/students' })).rejects.toThrow(
      'NEXT_REDIRECT:/auth/login?redirectTo=%2Fadmin%2Fstudents',
    );
  });

  it('anonimo com redirectTo malicioso: cai no default', async () => {
    mocks.getAuthUser.mockResolvedValue(null);
    await expect(run({ redirectTo: '//evil.com' })).rejects.toThrow(
      'NEXT_REDIRECT:/auth/login?redirectTo=%2Fadmin%2Fdashboard',
    );
  });

  it('aluno: redireciona para o dashboard do aluno', async () => {
    mocks.getAuthUser.mockResolvedValue({ id: 'u1', role: 'STUDENT' });
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/dashboard');
  });

  it.each(['NONE', 'PENDING'])('admin com status %s: redireciona para o setup preservando redirectTo', async (status) => {
    mocks.getAuthUser.mockResolvedValue(ADMIN);
    mocks.getMfaStatus.mockResolvedValue({ ...ACTIVE, status, enabled: false });
    await expect(run({ redirectTo: '/admin/students' })).rejects.toThrow(
      'NEXT_REDIRECT:/auth/mfa/setup?redirectTo=%2Fadmin%2Fstudents',
    );
  });

  it('admin com MFA ACTIVE: renderiza o formulario de verificacao e as saidas', async () => {
    mocks.getAuthUser.mockResolvedValue(ADMIN);
    mocks.getMfaStatus.mockResolvedValue(ACTIVE);
    render(await run({ redirectTo: '/admin/students' }));

    expect(screen.getByTestId('page-auth-mfa-challenge')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Verificação em duas etapas');
    expect(screen.getByTestId('form-mfa-challenge')).toBeInTheDocument();
    expect(screen.getByTestId('auth-mfa-exit-row')).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('status ilegivel (DB fora): fail-closed, mostra erro com retry e NAO o formulario', async () => {
    mocks.getAuthUser.mockResolvedValue(ADMIN);
    mocks.getMfaStatus.mockRejectedValue(new Error('db down'));
    render(await run());

    expect(screen.getByTestId('auth-mfa-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('form-mfa-challenge')).not.toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
