import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MfaChallengeForm } from '@/components/auth/mfa-challenge-form';

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

const REDIRECT = '/admin/students/abc?tab=notes';

async function submitCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.type(screen.getByTestId('form-mfa-challenge-code-input'), code);
  await user.click(screen.getByTestId('form-mfa-challenge-submit-button'));
}

describe('MfaChallengeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza campo, dica e botao desabilitado ate 6 caracteres', async () => {
    const user = userEvent.setup();
    render(<MfaChallengeForm redirectTo={REDIRECT} />);

    expect(screen.getByLabelText('Código')).toBeInTheDocument();
    expect(screen.getByText(/app autenticador ou um dos seus códigos/)).toBeInTheDocument();
    expect(screen.getByTestId('form-mfa-challenge-submit-button')).toBeDisabled();

    await user.type(screen.getByTestId('form-mfa-challenge-code-input'), '12345');
    expect(screen.getByTestId('form-mfa-challenge-submit-button')).toBeDisabled();
    await user.type(screen.getByTestId('form-mfa-challenge-code-input'), '6');
    expect(screen.getByTestId('form-mfa-challenge-submit-button')).toBeEnabled();
  });

  it('sucesso: envia o codigo (trim) sem redirect automatico de 401 e navega para redirectTo', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValueOnce({ data: { enabled: true } });
    render(<MfaChallengeForm redirectTo={REDIRECT} />);

    await submitCode(user, ' 123456 ');

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(REDIRECT));
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/auth/mfa/verify',
      { code: '123456' },
      { skipAuthRedirect: true },
    );
    // Permanece desabilitado ate a navegacao desmontar o formulario.
    expect(screen.getByTestId('form-mfa-challenge-submit-button')).toBeDisabled();
  });

  it('409 (MFA nao cadastrado): mostra link para o setup preservando redirectTo', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('MFA não iniciado.', 409));
    render(<MfaChallengeForm redirectTo={REDIRECT} />);

    await submitCode(user, '123456');

    expect(await screen.findByRole('alert')).toHaveTextContent('ainda não foi configurado');
    expect(screen.getByTestId('form-mfa-challenge-setup-link')).toHaveAttribute(
      'href',
      '/auth/mfa/setup?redirectTo=%2Fadmin%2Fstudents%2Fabc%3Ftab%3Dnotes',
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('400 (codigo invalido): erro inline com a mensagem da API e formulario reabilitado', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('Código inválido. Tente novamente.', 400));
    render(<MfaChallengeForm redirectTo={REDIRECT} />);

    await submitCode(user, '000000');

    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido');
    expect(screen.getByTestId('form-mfa-challenge-code-input')).toBeEnabled();
    expect(screen.getByTestId('form-mfa-challenge-submit-button')).toBeEnabled();
    expect(screen.queryByTestId('form-mfa-challenge-setup-link')).not.toBeInTheDocument();
  });

  it('401 (sessao expirada): navega para o login preservando redirectTo', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('Não autorizado', 401, 'AUTH_001'));
    render(<MfaChallengeForm redirectTo={REDIRECT} />);

    await submitCode(user, '123456');

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        '/auth/login?redirectTo=%2Fadmin%2Fstudents%2Fabc%3Ftab%3Dnotes',
      ),
    );
  });

  it('timeout (ABORTED): mensagem de tempo esgotado', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('Request aborted', 0, 'ABORTED'));
    render(<MfaChallengeForm redirectTo={REDIRECT} />);

    await submitCode(user, '123456');

    expect(await screen.findByRole('alert')).toHaveTextContent('demorou demais');
  });

  it('429 (rate limit): mensagem em pt-BR e formulario reabilitado', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('Too many requests', 429, 'RATE_LIMITED'));
    render(<MfaChallengeForm redirectTo={REDIRECT} />);

    await submitCode(user, '123456');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Muitas tentativas');
    expect(alert).not.toHaveTextContent('Too many');
    expect(screen.getByTestId('form-mfa-challenge-submit-button')).toBeEnabled();
  });

  it('codigo de recuperacao: campo aceita letras (inputMode text) e envia o valor com hifens', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValueOnce({ data: { enabled: true, usedRecoveryCode: true } });
    render(<MfaChallengeForm redirectTo={REDIRECT} />);

    const input = screen.getByTestId('form-mfa-challenge-code-input');
    expect(input).toHaveAttribute('inputmode', 'text');
    expect(input).toHaveAttribute('autocapitalize', 'characters');
    expect(input).not.toHaveAttribute('inputmode', 'numeric');

    await submitCode(user, 'C8BS-QC5A-YZQB');

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(REDIRECT));
    expect(apiPost).toHaveBeenCalledWith(
      '/api/v1/auth/mfa/verify',
      { code: 'C8BS-QC5A-YZQB' },
      { skipAuthRedirect: true },
    );
  });

  it('erro desconhecido (nao ApiError): mensagem generica', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<MfaChallengeForm redirectTo={REDIRECT} />);

    await submitCode(user, '123456');

    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido. Tente novamente.');
  });
});
