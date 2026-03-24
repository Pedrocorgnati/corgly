import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StudentSearchInput } from '@/components/admin/StudentSearchInput';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('StudentSearchInput', () => {
  it('renderiza campo de busca', () => {
    render(<StudentSearchInput />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('possui placeholder correto', () => {
    render(<StudentSearchInput />);
    expect(screen.getByPlaceholderText('Buscar aluno...')).toBeInTheDocument();
  });

  it('possui aria-label acessivel', () => {
    render(<StudentSearchInput />);
    expect(screen.getByLabelText('Buscar aluno por nome ou email')).toBeInTheDocument();
  });
});
