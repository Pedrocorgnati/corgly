import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StarRating } from '@/components/feedback/StarRating';

const defaultProps = {
  dimension: 'quality',
  label: 'Qualidade da aula',
  value: 0,
  onChange: vi.fn(),
};

describe('StarRating', () => {
  it('renderiza 5 estrelas', () => {
    render(<StarRating {...defaultProps} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
  });

  it('possui role radiogroup com label acessivel', () => {
    render(<StarRating {...defaultProps} />);
    const group = screen.getByRole('radiogroup');
    expect(group).toBeInTheDocument();
    expect(screen.getByText('Qualidade da aula')).toBeInTheDocument();
  });

  it('reflete o valor selecionado via aria-checked', () => {
    render(<StarRating {...defaultProps} value={3} />);
    const radios = screen.getAllByRole('radio');
    expect(radios[2]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAttribute('aria-checked', 'false');
    expect(radios[4]).toHaveAttribute('aria-checked', 'false');
  });

  it('chama onChange ao clicar em uma estrela', () => {
    const onChange = vi.fn();
    render(<StarRating {...defaultProps} onChange={onChange} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[3]);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('navega com ArrowRight incrementando o valor', () => {
    const onChange = vi.fn();
    render(<StarRating {...defaultProps} value={2} onChange={onChange} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.keyDown(radios[1], { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('desabilita interacao quando disabled', () => {
    const onChange = vi.fn();
    render(<StarRating {...defaultProps} onChange={onChange} disabled />);
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toBeDisabled();
    fireEvent.click(radios[2]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renderiza mensagem de erro quando fornecida', () => {
    render(<StarRating {...defaultProps} error="Campo obrigatorio" />);
    expect(screen.getByText('Campo obrigatorio')).toBeInTheDocument();
  });

  it('nao renderiza mensagem de erro quando nao fornecida', () => {
    render(<StarRating {...defaultProps} />);
    expect(screen.queryByText('Campo obrigatorio')).not.toBeInTheDocument();
  });
});
