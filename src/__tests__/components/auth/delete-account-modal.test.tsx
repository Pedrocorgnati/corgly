/**
 * Recusa de exclusao de conta.
 *
 * A exclusao e irreversivel e o unico caminho de saida do usuario e entender
 * POR QUE foi recusada. Este arquivo trava as quatro recusas que a rota emite
 * (`AUTH_001` senha errada, `AUTH_002` sessao caida, `ACTIVE_CREDITS` com
 * `details.batches`, falha de rede) e a regra que as separa: senha errada fica
 * na tela; sessao caida vai para o login.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { DeleteAccountModal } from '@/components/auth/delete-account-modal';

const apiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: apiPost, get: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    details?: unknown;
    constructor(message: string, status: number, code?: string, details?: unknown) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
}));

const logout = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout }) }));

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

import { ApiError } from '@/lib/api-client';

async function preencherEEnviar(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId('form-delete-account-password-input'), 'senha-do-usuario');
  await user.type(screen.getByTestId('form-delete-account-confirmation-input'), 'EXCLUIR');
  await waitFor(() =>
    expect(screen.getByTestId('form-delete-account-submit-button')).toBeEnabled(),
  );
  await user.click(screen.getByTestId('form-delete-account-submit-button'));
}

describe('DeleteAccountModal — recusas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia com skipAuthRedirect para que senha errada nao expulse da conta', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValueOnce({ data: null, error: null, message: null });
    render(<DeleteAccountModal isOpen onClose={vi.fn()} />);

    await preencherEEnviar(user);

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        '/api/v1/auth/delete-account',
        { password: 'senha-do-usuario' },
        { skipAuthRedirect: true },
      ),
    );
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('401 AUTH_001 (senha incorreta) fica na tela e nao dispara auth:expired', async () => {
    const user = userEvent.setup();
    const authExpired = vi.fn();
    window.addEventListener('auth:expired', authExpired);
    apiPost.mockRejectedValueOnce(
      new ApiError('Email ou senha incorretos. Verifique e tente novamente.', 401, 'AUTH_001'),
    );
    render(<DeleteAccountModal isOpen onClose={vi.fn()} />);

    await preencherEEnviar(user);

    const recusa = await screen.findByTestId('form-delete-account-refusal');
    expect(recusa).toHaveAttribute('data-motivo', 'senha');
    expect(recusa).toHaveTextContent('Email ou senha incorretos. Verifique e tente novamente.');
    expect(recusa).toHaveTextContent('Confirme a senha e tente novamente.');
    expect(authExpired).not.toHaveBeenCalled();
    window.removeEventListener('auth:expired', authExpired);
  });

  it('401 AUTH_002 (sessao caida) avisa e delega o destino ao AuthProvider', async () => {
    const user = userEvent.setup();
    const authExpired = vi.fn();
    window.addEventListener('auth:expired', authExpired);
    apiPost.mockRejectedValueOnce(
      new ApiError('Sua sessao expirou. Faca login novamente.', 401, 'AUTH_002'),
    );
    render(<DeleteAccountModal isOpen onClose={vi.fn()} />);

    await preencherEEnviar(user);

    const recusa = await screen.findByTestId('form-delete-account-refusal');
    expect(recusa).toHaveAttribute('data-motivo', 'sessao');
    expect(toastError).toHaveBeenCalledWith('Sua sessao expirou. Faca login novamente.');
    await waitFor(() => expect(authExpired).toHaveBeenCalledTimes(1));
    window.removeEventListener('auth:expired', authExpired);
  });

  it('409 ACTIVE_CREDITS mostra a contagem de lotes e a saida para agendar', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(
      new ApiError(
        'Voce ainda tem creditos validos. Use-os antes de excluir a conta.',
        409,
        'ACTIVE_CREDITS',
        { batches: 3 },
      ),
    );
    render(<DeleteAccountModal isOpen onClose={vi.fn()} />);

    await preencherEEnviar(user);

    const recusa = await screen.findByTestId('form-delete-account-refusal');
    expect(recusa).toHaveAttribute('data-motivo', 'creditos');
    expect(screen.getByTestId('form-delete-account-refusal-batches')).toHaveTextContent(
      'Lotes ativos: 3.',
    );
    expect(screen.getByTestId('form-delete-account-refusal-schedule-link')).toHaveAttribute(
      'href',
      '/schedule',
    );
  });

  it('409 sem details.batches nao inventa contagem', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(
      new ApiError('Voce ainda tem creditos validos.', 409, 'ACTIVE_CREDITS'),
    );
    render(<DeleteAccountModal isOpen onClose={vi.fn()} />);

    await preencherEEnviar(user);

    await screen.findByTestId('form-delete-account-refusal');
    expect(screen.queryByTestId('form-delete-account-refusal-batches')).not.toBeInTheDocument();
  });

  it('falha de rede vira recusa explicita, nao silencio', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<DeleteAccountModal isOpen onClose={vi.fn()} />);

    await preencherEEnviar(user);

    const recusa = await screen.findByTestId('form-delete-account-refusal');
    expect(recusa).toHaveAttribute('data-motivo', 'rede');
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('recusa some quando o modal e fechado e reaberto', async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValueOnce(new ApiError('Dados invalidos', 400, 'VAL_001'));
    const onClose = vi.fn();
    const { rerender } = render(<DeleteAccountModal isOpen onClose={onClose} />);

    await preencherEEnviar(user);
    expect(await screen.findByTestId('form-delete-account-refusal')).toHaveAttribute(
      'data-motivo',
      'dados',
    );

    await user.click(screen.getByTestId('form-delete-account-cancel-button'));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<DeleteAccountModal isOpen={false} onClose={onClose} />);
    rerender(<DeleteAccountModal isOpen onClose={onClose} />);

    expect(screen.queryByTestId('form-delete-account-refusal')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-delete-account-password-input')).toHaveValue('');
  });
});
