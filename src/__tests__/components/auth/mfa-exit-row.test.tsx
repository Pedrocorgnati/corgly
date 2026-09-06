import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MfaExitRow } from '@/components/auth/mfa-exit-row';

const apiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: apiPost, get: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

describe('MfaExitRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza sair e voltar ao inicio', () => {
    render(<MfaExitRow />);
    expect(screen.getByTestId('auth-mfa-logout-button')).toHaveTextContent('Sair da conta');
    expect(screen.getByTestId('auth-mfa-home-link')).toHaveAttribute('href', '/');
  });

  it('sair chama o logout sem redirect automatico de 401 e desabilita o botao', async () => {
    const user = userEvent.setup();
    apiPost.mockImplementation(() => new Promise(() => {}));
    render(<MfaExitRow />);

    await user.click(screen.getByTestId('auth-mfa-logout-button'));

    await waitFor(() => expect(screen.getByTestId('auth-mfa-logout-button')).toBeDisabled());
    expect(apiPost).toHaveBeenCalledWith('/api/v1/auth/logout', {}, { skipAuthRedirect: true });
    expect(screen.getByTestId('auth-mfa-logout-button')).toHaveTextContent('Saindo...');
  });
});
