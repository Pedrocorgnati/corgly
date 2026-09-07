import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/components/auth/login-form';
import { ROUTES } from '@/lib/constants/routes';
import {
  clearPlanSelection,
  savePlanSelection,
  PLAN_SELECTION_TTL_MS,
} from '@/lib/constants/landing';

// Mocks precisam existir antes do hoisting do vi.mock.
const { pushMock, postMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  postMock: vi.fn(),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock api-client
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: postMock,
    get: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/** Envelope real de POST /api/v1/auth/login: apiResponse({ user, token }). */
function loginEnvelope(user: {
  role: string;
  onboardingCompletedAt: string | null;
}) {
  return {
    data: {
      user: { id: 'u1', name: 'Aluno', ...user },
      token: 'jwt-token',
    },
    error: null,
    message: 'Login realizado com sucesso.',
  };
}

async function submitValidLogin() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'aluno@exemplo.com');
  await user.type(screen.getByLabelText('Senha'), 'senha-valida');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    pushMock.mockReset();
    postMock.mockReset();
    // Cada teste parte de /auth/login sem query.
    window.history.replaceState({}, '', ROUTES.LOGIN);
    // Escolha de plano e estado de `localStorage` que atravessa testes.
    clearPlanSelection();
  });

  it('renderiza campos de email e senha', () => {
    render(<LoginForm />);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('renderiza link para esqueci minha senha', () => {
    render(<LoginForm />);

    expect(screen.getByText('Esqueci minha senha')).toBeInTheDocument();
  });

  it('exibe erro de validação quando email está vazio', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
  });

  it('renderiza botão de mostrar/ocultar senha', () => {
    render(<LoginForm />);

    expect(screen.getByLabelText('Mostrar senha')).toBeInTheDocument();
  });

  it('alterna visibilidade da senha ao clicar no botão', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const passwordInput = screen.getByLabelText('Senha');
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByLabelText('Mostrar senha'));
    expect(passwordInput).toHaveAttribute('type', 'text');
  });

  // ── Destino pos-login: os tres ramos ──────────────────────────────────────

  it('manda ADMIN para o painel admin, nunca para o onboarding', async () => {
    postMock.mockResolvedValue(
      loginEnvelope({ role: 'ADMIN', onboardingCompletedAt: null }),
    );
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(ROUTES.ADMIN_DASHBOARD));
  });

  it('manda aluno sem onboarding concluido para o onboarding', async () => {
    postMock.mockResolvedValue(
      loginEnvelope({ role: 'STUDENT', onboardingCompletedAt: null }),
    );
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(ROUTES.ONBOARDING));
  });

  it('manda aluno com onboarding concluido para o dashboard', async () => {
    postMock.mockResolvedValue(
      loginEnvelope({
        role: 'STUDENT',
        onboardingCompletedAt: '2026-01-10T12:00:00.000Z',
      }),
    );
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(ROUTES.DASHBOARD));
  });

  // ── redirectTo escrito pelo proxy ─────────────────────────────────────────

  it('honra o redirectTo interno gravado pelo proxy para o admin', async () => {
    window.history.replaceState({}, '', '/auth/login?redirectTo=%2Fadmin%2Fstudents%3Ftab%3Dnotes');
    postMock.mockResolvedValue(
      loginEnvelope({ role: 'ADMIN', onboardingCompletedAt: null }),
    );
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith('/admin/students?tab=notes'),
    );
  });

  it('ignora redirectTo para host externo (open redirect)', async () => {
    window.history.replaceState({}, '', '/auth/login?redirectTo=https%3A%2F%2Fevil.com%2Fadmin');
    postMock.mockResolvedValue(
      loginEnvelope({ role: 'ADMIN', onboardingCompletedAt: null }),
    );
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(ROUTES.ADMIN_DASHBOARD));
  });

  it('nao aplica redirectTo de admin ao aluno', async () => {
    window.history.replaceState({}, '', '/auth/login?redirectTo=%2Fadmin%2Fstudents');
    postMock.mockResolvedValue(
      loginEnvelope({ role: 'STUDENT', onboardingCompletedAt: null }),
    );
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(ROUTES.ONBOARDING));
  });

  // ── Ponte landing -> cadastro -> vitrine ──────────────────────────────────
  //
  // O plano escolhido na landing e gravado por `register-form.tsx` assim que a
  // pagina de cadastro abre — inclusive para quem ja tem conta e desce ate
  // "Entrar". Sem o desvio abaixo essa pessoa caia no dashboard e a escolha
  // ficava encalhada no storage ate expirar.

  const COMPLETED = '2026-01-10T12:00:00.000Z';

  it('leva aluno com plano guardado para a vitrine, nao para o dashboard', async () => {
    savePlanSelection({ plan: 'PACK_10' });
    postMock.mockResolvedValue(
      loginEnvelope({ role: 'STUDENT', onboardingCompletedAt: COMPLETED }),
    );
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(`${ROUTES.CREDITS}?plan=PACK_10`),
    );
  });

  it('carrega o volume mensal junto do plano MONTHLY', async () => {
    savePlanSelection({ plan: 'MONTHLY', monthlyLessons: 20 });
    postMock.mockResolvedValue(
      loginEnvelope({ role: 'STUDENT', onboardingCompletedAt: COMPLETED }),
    );
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(`${ROUTES.CREDITS}?plan=MONTHLY&lessons=20`),
    );
  });

  it('ignora escolha expirada e mantem o dashboard', async () => {
    savePlanSelection({ plan: 'SINGLE' }, Date.now() - PLAN_SELECTION_TTL_MS - 1);
    postMock.mockResolvedValue(
      loginEnvelope({ role: 'STUDENT', onboardingCompletedAt: COMPLETED }),
    );
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(ROUTES.DASHBOARD));
  });

  it('onboarding pendente vence a escolha de plano guardada', async () => {
    savePlanSelection({ plan: 'SINGLE' });
    postMock.mockResolvedValue(
      loginEnvelope({ role: 'STUDENT', onboardingCompletedAt: null }),
    );
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(ROUTES.ONBOARDING));
  });

  it('admin nunca e desviado para a vitrine', async () => {
    savePlanSelection({ plan: 'SINGLE' });
    postMock.mockResolvedValue(
      loginEnvelope({ role: 'ADMIN', onboardingCompletedAt: null }),
    );
    render(<LoginForm />);

    await submitValidLogin();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(ROUTES.ADMIN_DASHBOARD));
  });
});
