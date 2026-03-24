import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('renderiza com tipo text por padrão', () => {
    render(<Input aria-label="Nome" />);
    const input = screen.getByRole('textbox', { name: 'Nome' });
    expect(input).toBeInTheDocument();
  });

  it('aceita e exibe valor', () => {
    render(<Input aria-label="Email" defaultValue="test@example.com" />);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveValue('test@example.com');
  });

  it('aceita digitação', () => {
    render(<Input aria-label="Campo" />);
    const input = screen.getByRole('textbox', { name: 'Campo' });

    fireEvent.change(input, { target: { value: 'novo valor' } });
    expect(input).toHaveValue('novo valor');
  });

  it('fica desabilitado quando disabled', () => {
    render(<Input aria-label="Desativado" disabled />);
    const input = screen.getByRole('textbox', { name: 'Desativado' });
    expect(input).toBeDisabled();
  });

  it('exibe placeholder', () => {
    render(<Input placeholder="Digite aqui..." />);
    expect(screen.getByPlaceholderText('Digite aqui...')).toBeInTheDocument();
  });

  it('aplica className customizado', () => {
    render(<Input aria-label="Custom" className="my-class" />);
    const input = screen.getByRole('textbox', { name: 'Custom' });
    expect(input.className).toContain('my-class');
  });
});
