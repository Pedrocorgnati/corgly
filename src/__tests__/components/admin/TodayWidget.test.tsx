import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TodayWidget } from '@/components/admin/TodayWidget';

describe('TodayWidget', () => {
  it('renderiza 4 contadores de status', () => {
    const today = { scheduled: 3, inProgress: 1, completed: 5, cancelled: 0 };
    render(<TodayWidget today={today} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('exibe os labels corretos', () => {
    const today = { scheduled: 0, inProgress: 0, completed: 0, cancelled: 0 };
    render(<TodayWidget today={today} />);

    expect(screen.getByText('Agendadas')).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
    expect(screen.getByText('Concluídas')).toBeInTheDocument();
    expect(screen.getByText('Canceladas')).toBeInTheDocument();
  });

  it('renderiza corretamente com valores zero', () => {
    const today = { scheduled: 0, inProgress: 0, completed: 0, cancelled: 0 };
    render(<TodayWidget today={today} />);

    expect(screen.getByText('0 aulas no total')).toBeInTheDocument();
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(4);
  });

  it('exibe singular quando total e 1', () => {
    const today = { scheduled: 1, inProgress: 0, completed: 0, cancelled: 0 };
    render(<TodayWidget today={today} />);

    expect(screen.getByText('1 aula no total')).toBeInTheDocument();
  });
});
