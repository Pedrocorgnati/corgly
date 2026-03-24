import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renderiza com texto', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('dispara onClick ao clicar', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Clique</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Clique' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('não dispara onClick quando disabled', () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Desativado
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Desativado' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('aplica variante destructive', () => {
    render(<Button variant="destructive">Excluir</Button>);
    const button = screen.getByRole('button', { name: 'Excluir' });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('destructive');
  });

  it('aplica tamanho sm', () => {
    render(<Button size="sm">Pequeno</Button>);
    const button = screen.getByRole('button', { name: 'Pequeno' });
    expect(button).toBeInTheDocument();
  });

  it('aplica className customizado', () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByRole('button', { name: 'Custom' });
    expect(button.className).toContain('custom-class');
  });
});
