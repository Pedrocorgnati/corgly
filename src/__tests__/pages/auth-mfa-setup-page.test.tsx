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

import MfaSetupPage from '@/app/(public)/auth/mfa/setup/page';

const ADMIN = { id: 'admin-1', role: 'ADMIN' };
const NONE = { enabled: false, status: 'NONE', confirmedAt: null, recoveryCodesRemaining: 0 };

function run(params: Record<string, string | string[] | undefined> = {}) {
  return MfaSetupPage({ searchParams: Promise.resolve(params) });
}

describe('/auth/mfa/setup (server page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('anonimo: redireciona para o login com retorno ao setup', async () => {
    mocks.getAuthUser.mockResolvedValue(null);
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/auth/login?redirectTo=%2Fauth%2Fmfa%2Fsetup');
    expect(mocks.getMfaStatus).not.toHaveBeenCalled();
  });

  it('aluno: redireciona para o dashboard do aluno', async () => {
    mocks.getAuthUser.mockResolvedValue({ id: 'u1', role: 'STUDENT' });
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/dashboard');
  });

  it('admin com MFA ACTIVE: redireciona para a seguranca da conta (nunca loop com o challenge)', async () => {
    mocks.getAuthUser.mockResolvedValue(ADMIN);
    mocks.getMfaStatus.mockResolvedValue({ ...NONE, status: 'ACTIVE', enabled: true });
    await expect(run({ redirectTo: '/admin/dashboard' })).rejects.toThrow('NEXT_REDIRECT:/admin/account/security');
  });

  it('admin com status NONE: renderiza o fluxo de cadastro e as saidas', async () => {
    mocks.getAuthUser.mockResolvedValue(ADMIN);
    mocks.getMfaStatus.mockResolvedValue(NONE);
    render(await run({ redirectTo: '/admin/dashboard' }));

    expect(screen.getByTestId('page-auth-mfa-setup')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Configurar autenticação em duas etapas');
    expect(screen.getByTestId('auth-mfa-setup-flow')).toBeInTheDocument();
    expect(screen.getByTestId('admin-account-security-init-mfa-button')).toHaveTextContent('Configurar MFA');
    expect(screen.getByTestId('auth-mfa-exit-row')).toBeInTheDocument();
  });

  it('admin com status PENDING: renderiza o aviso de cadastro incompleto', async () => {
    mocks.getAuthUser.mockResolvedValue(ADMIN);
    mocks.getMfaStatus.mockResolvedValue({ ...NONE, status: 'PENDING' });
    render(await run());
    expect(screen.getByTestId('mfa-enrollment-pending-notice')).toBeInTheDocument();
  });

  it('status ilegivel (DB fora): fail-closed com estado de erro e retry', async () => {
    mocks.getAuthUser.mockResolvedValue(ADMIN);
    mocks.getMfaStatus.mockRejectedValue(new Error('db down'));
    render(await run());
    expect(screen.getByTestId('auth-mfa-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-account-security-init-mfa-button')).not.toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('redirectTo em array (?redirectTo=a&redirectTo=b): usa o primeiro sem quebrar', async () => {
    mocks.getAuthUser.mockResolvedValue(ADMIN);
    mocks.getMfaStatus.mockResolvedValue(NONE);
    render(await run({ redirectTo: ['/admin/students', '//evil.com'] }));
    expect(screen.getByTestId('page-auth-mfa-setup')).toBeInTheDocument();
  });
});
