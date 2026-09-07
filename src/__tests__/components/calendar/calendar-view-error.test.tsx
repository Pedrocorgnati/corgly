/**
 * Item 014 - exibicao do erro de carregamento na agenda.
 *
 * `CalendarView` nao tinha por onde receber a falha: `CalendarViewProps`
 * declarava oito props e nenhuma delas era de erro. Quando a busca falhava,
 * os hooks zeravam a lista e o componente renderizava a grade sem nenhum
 * ponto verde, fechando com o rodape "Dias com horarios disponiveis" - a tela
 * AFIRMAVA ausencia de horario onde na verdade houve falha.
 *
 * O que este teste trava:
 *
 *  1. com erro, o bloco de erro aparece e a grade + rodape somem (o falso
 *     negativo morre nesta superficie);
 *  2. o botao de repetir chama o `onRetry` recebido;
 *  3. a prop opcional nao mexeu no caminho feliz;
 *  4. erro vence carregamento (precedencia explicita, ST001).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CalendarView } from '@/components/calendar/CalendarView';

const BASE = {
  currentMonth: 5,
  currentYear: 2026,
  slotsByDate: {},
  selectedDate: null,
  onSelectDate: vi.fn(),
  onPrevMonth: vi.fn(),
  onNextMonth: vi.fn(),
  isLoading: false,
};

describe('CalendarView - erro de carregamento', () => {
  it('com erro, mostra o bloco de erro e nao afirma ausencia de horario', () => {
    render(<CalendarView {...BASE} error="Falha ao buscar horarios" />);

    const bloco = screen.getByTestId('calendar-view-error');
    expect(bloco).toBeInTheDocument();
    expect(bloco).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Falha ao buscar horarios')).toBeInTheDocument();

    expect(screen.queryByTestId('calendar-view-grid')).not.toBeInTheDocument();
    expect(screen.queryByText('Dias com horários disponíveis')).not.toBeInTheDocument();
  });

  it('o botao de repetir chama onRetry uma vez', () => {
    const onRetry = vi.fn();
    render(<CalendarView {...BASE} error="Falha ao buscar horarios" onRetry={onRetry} />);

    fireEvent.click(screen.getByTestId('calendar-view-error-retry-button'));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('sem erro, o caminho feliz segue intacto', () => {
    render(<CalendarView {...BASE} error={null} />);

    expect(screen.queryByTestId('calendar-view-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('calendar-view-grid')).toBeInTheDocument();
  });

  it('erro vence carregamento', () => {
    render(<CalendarView {...BASE} isLoading error="Falha ao buscar horarios" />);

    expect(screen.getByTestId('calendar-view-error')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-view-loading')).not.toBeInTheDocument();
  });
});
