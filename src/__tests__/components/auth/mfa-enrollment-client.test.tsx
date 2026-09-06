import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MfaEnrollmentClient } from '@/components/auth/mfa-enrollment-client';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

const apiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: apiPost, get: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ApiError } from '@/lib/api-client';

const NONE = { enabled: false, status: 'NONE' as const, confirmedAt: null, recoveryCodesRemaining: 0 };
const PENDING = { ...NONE, status: 'PENDING' as const };
const ACTIVE = { enabled: true, status: 'ACTIVE' as const, confirmedAt: '2026-01-01T00:00:00.000Z', recoveryCodesRemaining: 8 };

const ENROLLMENT = {
  secret: 'JBSWY3DPEHPK3PXP',
  otpauthUri: 'otpauth://totp/Corgly:admin?secret=JBSWY3DPEHPK3PXP&issuer=Corgly',
  recoveryCodes: ['AAAA-BBBB-CCCC', 'DDDD-EEEE-FFFF'],
};

const VERIFY_OK = {
  data: {
    enabled: true,
    status: 'ACTIVE',
    justEnrolled: true,
    usedRecoveryCode: false,
    recoveryCodesRemaining: 2,
    mfaVerifiedAt: '2026-09-06T00:00:00.000Z',
  },
};

async function runEnrollment(user: ReturnType<typeof userEvent.setup>) {
  apiPost.mockResolvedValueOnce({ data: ENROLLMENT });
  await user.click(screen.getByTestId('admin-account-security-init-mfa-button'));

  const card = await screen.findByTestId('admin-account-security-enrollment-card');
  expect(card).toBeInTheDocument();
  expect(screen.getByTestId('mfa-enrollment-qr')).toBeInTheDocument();
  expect(screen.getByTestId('mfa-enrollment-secret')).toHaveTextContent(ENROLLMENT.secret);
  expect(screen.getByTestId('mfa-enrollment-open-app-link')).toHaveAttribute('href', ENROLLMENT.otpauthUri);

  apiPost.mockResolvedValueOnce(VERIFY_OK);
  await user.type(screen.getByTestId('form-mfa-verify-code-input'), '123456');
  await user.click(screen.getByTestId('form-mfa-verify-submit-button'));

  const success = await screen.findByTestId('mfa-enrollment-success-card');
  expect(success).toHaveTextContent('AAAA-BBBB-CCCC');
  expect(success).toHaveTextContent('DDDD-EEEE-FFFF');
}

describe('MfaEnrollmentClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('modo setup: cadastro completo termina no botao de concluir, que navega para redirectTo (sem refresh)', async () => {
    const user = userEvent.setup();
    render(<MfaEnrollmentClient mode="setup" initialStatus={NONE} loadError={false} redirectTo="/admin/students" />);

    expect(screen.getByTestId('auth-mfa-setup-flow')).toBeInTheDocument();
    expect(screen.getByTestId('admin-account-security-init-mfa-button')).toHaveTextContent('Configurar MFA');

    await runEnrollment(user);

    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Concluir e acessar o painel' }));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/admin/students');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('modo setup sem redirectTo: concluir vai para o dashboard admin', async () => {
    const user = userEvent.setup();
    render(<MfaEnrollmentClient mode="setup" initialStatus={NONE} loadError={false} />);
    await runEnrollment(user);
    await user.click(screen.getByTestId('mfa-enrollment-finish-button'));
    expect(router.replace).toHaveBeenCalledWith('/admin/dashboard');
  });

  it('modo settings: cadastro completo faz refresh e concluir apenas fecha o cartao', async () => {
    const user = userEvent.setup();
    render(<MfaEnrollmentClient mode="settings" initialStatus={NONE} loadError={false} />);

    expect(screen.getByTestId('admin-account-security-mfa')).toBeInTheDocument();
    await runEnrollment(user);

    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(screen.queryByTestId('mfa-enrollment-success-card')).not.toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('status PENDING: mostra aviso e rotulo de reinicio', () => {
    render(<MfaEnrollmentClient mode="setup" initialStatus={PENDING} loadError={false} />);
    expect(screen.getByTestId('mfa-enrollment-pending-notice')).toBeInTheDocument();
    expect(screen.getByTestId('admin-account-security-init-mfa-button')).toHaveTextContent('Gerar novo segredo e continuar');
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('status ACTIVE (settings): rotulo de reconfiguracao', () => {
    render(<MfaEnrollmentClient mode="settings" initialStatus={ACTIVE} loadError={false} />);
    expect(screen.getByTestId('admin-account-security-init-mfa-button')).toHaveTextContent('Reconfigurar / gerar novos códigos');
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('init 403 mfa_required: envia para o challenge com retorno a seguranca da conta', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('MFA recente necessaria', 403, 'mfa_required'));
    render(<MfaEnrollmentClient mode="settings" initialStatus={ACTIVE} loadError={false} />);

    await user.click(screen.getByTestId('admin-account-security-init-mfa-button'));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        '/auth/mfa/challenge?redirectTo=%2Fadmin%2Faccount%2Fsecurity',
      ),
    );
  });

  it('init 401: sessao expirada envia para o login com retorno a pagina atual', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('Não autorizado', 401, 'AUTH_001'));
    render(<MfaEnrollmentClient mode="setup" initialStatus={NONE} loadError={false} />);

    await user.click(screen.getByTestId('admin-account-security-init-mfa-button'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(String(router.replace.mock.calls[0][0])).toMatch(/^\/auth\/login\?redirectTo=/);
  });

  it('init falha generica: mostra erro e mantem o botao', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('Falha ao gerar segredo', 500));
    render(<MfaEnrollmentClient mode="setup" initialStatus={NONE} loadError={false} />);

    await user.click(screen.getByTestId('admin-account-security-init-mfa-button'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao gerar segredo');
    expect(screen.getByTestId('admin-account-security-init-mfa-button')).toBeEnabled();
  });

  it('init 403 mfa_required em modo setup: challenge com retorno ao destino original', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('MFA recente necessaria', 403, 'mfa_required'));
    render(<MfaEnrollmentClient mode="setup" initialStatus={NONE} loadError={false} redirectTo="/admin/students?page=2" />);

    await user.click(screen.getByTestId('admin-account-security-init-mfa-button'));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        '/auth/mfa/challenge?redirectTo=%2Fadmin%2Fstudents%3Fpage%3D2',
      ),
    );
  });

  it('init 429 (rate limit): mensagem em pt-BR, nunca o corpo em ingles do proxy', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('Too many requests', 429, 'RATE_LIMITED'));
    render(<MfaEnrollmentClient mode="setup" initialStatus={NONE} loadError={false} />);

    await user.click(screen.getByTestId('admin-account-security-init-mfa-button'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Muitas tentativas');
    expect(alert).not.toHaveTextContent('Too many');
    expect(screen.getByTestId('admin-account-security-init-mfa-button')).toBeEnabled();
  });

  it('init timeout (ABORTED): mensagem de tempo esgotado', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('Request aborted', 0, 'ABORTED'));
    render(<MfaEnrollmentClient mode="setup" initialStatus={NONE} loadError={false} />);

    await user.click(screen.getByTestId('admin-account-security-init-mfa-button'));

    expect(await screen.findByRole('alert')).toHaveTextContent('demorou demais');
  });

  it('verify 400: erro inline e formulario continua editavel', async () => {
    const user = userEvent.setup();
    render(<MfaEnrollmentClient mode="setup" initialStatus={NONE} loadError={false} />);

    apiPost.mockResolvedValueOnce({ data: ENROLLMENT });
    await user.click(screen.getByTestId('admin-account-security-init-mfa-button'));
    await screen.findByTestId('admin-account-security-enrollment-card');

    apiPost.mockRejectedValueOnce(new ApiError('Código inválido. Tente novamente.', 400));
    await user.type(screen.getByTestId('form-mfa-verify-code-input'), '000000');
    await user.click(screen.getByTestId('form-mfa-verify-submit-button'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido');
    expect(screen.getByTestId('form-mfa-verify-code-input')).toBeEnabled();
    expect(screen.queryByTestId('mfa-enrollment-success-card')).not.toBeInTheDocument();
  });

  it('botao de confirmar fica desabilitado com menos de 6 caracteres', async () => {
    const user = userEvent.setup();
    render(<MfaEnrollmentClient mode="setup" initialStatus={NONE} loadError={false} />);
    apiPost.mockResolvedValueOnce({ data: ENROLLMENT });
    await user.click(screen.getByTestId('admin-account-security-init-mfa-button'));
    await screen.findByTestId('admin-account-security-enrollment-card');

    expect(screen.getByTestId('form-mfa-verify-submit-button')).toBeDisabled();
    await user.type(screen.getByTestId('form-mfa-verify-code-input'), '12345');
    expect(screen.getByTestId('form-mfa-verify-submit-button')).toBeDisabled();
    await user.type(screen.getByTestId('form-mfa-verify-code-input'), '6');
    expect(screen.getByTestId('form-mfa-verify-submit-button')).toBeEnabled();
  });

  it('modo setup: o botao secundario gera outro segredo em vez de cancelar', async () => {
    const user = userEvent.setup();
    render(<MfaEnrollmentClient mode="setup" initialStatus={NONE} loadError={false} />);
    apiPost.mockResolvedValueOnce({ data: ENROLLMENT });
    await user.click(screen.getByTestId('admin-account-security-init-mfa-button'));
    await screen.findByTestId('admin-account-security-enrollment-card');

    const other = { ...ENROLLMENT, secret: 'OTHERSECRET234567' };
    apiPost.mockResolvedValueOnce({ data: other });
    await user.click(screen.getByTestId('form-mfa-verify-cancel-button'));

    await waitFor(() =>
      expect(screen.getByTestId('mfa-enrollment-secret')).toHaveTextContent('OTHERSECRET234567'),
    );
    expect(apiPost).toHaveBeenCalledTimes(2);
  });

  it('modo settings: cancelar volta ao estado inicial sem chamar a API', async () => {
    const user = userEvent.setup();
    render(<MfaEnrollmentClient mode="settings" initialStatus={NONE} loadError={false} />);
    apiPost.mockResolvedValueOnce({ data: ENROLLMENT });
    await user.click(screen.getByTestId('admin-account-security-init-mfa-button'));
    await screen.findByTestId('admin-account-security-enrollment-card');

    await user.click(screen.getByTestId('form-mfa-verify-cancel-button'));

    expect(screen.queryByTestId('admin-account-security-enrollment-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('admin-account-security-init-mfa-button')).toBeInTheDocument();
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('loadError: estado de erro com retry (refresh) em cada modo', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MfaEnrollmentClient mode="setup" initialStatus={NONE} loadError />);
    expect(screen.getByTestId('auth-mfa-load-error')).toBeInTheDocument();
    await user.click(screen.getByTestId('auth-mfa-load-error-retry-button'));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    unmount();

    render(<MfaEnrollmentClient mode="settings" initialStatus={NONE} loadError />);
    expect(screen.getByTestId('admin-account-security-error')).toBeInTheDocument();
  });
});
