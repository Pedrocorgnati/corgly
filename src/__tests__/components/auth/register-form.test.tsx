import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { RegisterForm } from '@/components/auth/register-form';

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

describe('RegisterForm', () => {
  it('renderiza todos os campos obrigatórios', () => {
    render(<RegisterForm />);

    expect(screen.getByLabelText('Nome completo')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar Conta' })).toBeInTheDocument();
  });

  it('renderiza seletores de país e fuso horário', () => {
    render(<RegisterForm />);

    expect(screen.getByText('Selecione seu país')).toBeInTheDocument();
  });

  it('renderiza checkboxes de termos e marketing', () => {
    render(<RegisterForm />);

    expect(screen.getByText(/Li e aceito os/)).toBeInTheDocument();
    expect(screen.getByText(/Aceito receber novidades/)).toBeInTheDocument();
  });

  it('exibe erros de validação quando formulário é submetido vazio', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.click(screen.getByRole('button', { name: 'Criar Conta' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('renderiza botões de mostrar/ocultar senha', () => {
    render(<RegisterForm />);

    const toggleButtons = screen.getAllByLabelText('Mostrar senha');
    expect(toggleButtons).toHaveLength(2);
  });

  it('exibe medidor de força da senha ao digitar', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const passwordInput = screen.getByLabelText('Senha');
    await user.type(passwordInput, 'Abc123!@');

    // strength meter shows text like "Senha fraca", "Senha forte" etc.
    expect(screen.getByText(/Senha (fraca|razoável|forte|muito forte)/)).toBeInTheDocument();
  });
});
