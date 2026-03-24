import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/components/auth/login-form';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock api-client
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: vi.fn(),
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

describe('LoginForm', () => {
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
});
