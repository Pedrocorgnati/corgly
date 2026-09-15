/**
 * Item 036 - horario reservado pelo proprio aluno na agenda.
 *
 * A disponibilidade publica exclui todo horario ocupado; a reserva do proprio
 * aluno chega por leitura autenticada separada e precisa aparecer IDENTIFICADA e
 * FORA de selecao. Os casos abaixo falham no codigo anterior ao item: SlotPicker e
 * CalendarView ignoravam a reserva propria.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { render, screen, fireEvent } from '@/test/utils';
import { SlotPicker } from '@/components/calendar/SlotPicker';
import { CalendarView } from '@/components/calendar/CalendarView';
import { useOwnReservations } from '@/hooks/useOwnReservations';
import type { AvailabilitySlot } from '@/hooks/useCalendar';
import type { OwnReservedSlot } from '@/actions/sessions';

const mocks = vi.hoisted(() => ({
  getOwnReservedSlots: vi.fn(),
}));

vi.mock('@/actions/sessions', () => ({
  getOwnReservedSlots: mocks.getOwnReservedSlots,
}));

vi.mock('@/components/ui/timezone-display', () => ({
  TimezoneDisplay: () => null,
}));

const OWN: OwnReservedSlot = {
  id: 'slot-own',
  sessionId: 'session-own',
  startAt: '2099-01-15T14:00:00.000Z',
  endAt: '2099-01-15T14:50:00.000Z',
};

const FREE: AvailabilitySlot = {
  id: 'slot-free',
  startAt: '2099-01-15T16:00:00.000Z',
  endAt: '2099-01-15T16:50:00.000Z',
  isBlocked: false,
};

function renderPicker(props: Partial<Parameters<typeof SlotPicker>[0]> = {}) {
  const onSelectSlot = vi.fn();
  const utils = render(
    <SlotPicker
      slots={[]}
      ownSlots={[OWN]}
      selectedSlotId={null}
      onSelectSlot={onSelectSlot}
      studentTz="UTC"
      adminTz="UTC"
      isLoading={false}
      selectedDate="2099-01-15"
      {...props}
    />,
  );
  return { ...utils, onSelectSlot };
}

const CALENDAR_BASE = {
  currentMonth: 0,
  currentYear: 2099,
  slotsByDate: {} as Record<string, AvailabilitySlot[]>,
  selectedDate: null,
  onSelectDate: vi.fn(),
  onPrevMonth: vi.fn(),
  onNextMonth: vi.fn(),
  isLoading: false,
};

describe('SlotPicker - reserva propria do aluno', () => {
  it('identifica o horario proprio com texto visivel e aria-label, sem cair no vazio', () => {
    renderPicker();

    const own = screen.getByTestId('schedule-slot-own-slot-own');
    expect(own).toHaveTextContent('Reservado por você');
    expect(own).toHaveAttribute('aria-label', '14:00, horário já reservado por você');
    expect(own).toHaveAttribute('aria-disabled', 'true');
    expect(own).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByTestId('schedule-empty')).not.toBeInTheDocument();
  });

  it('clicar no horario proprio nao chama onSelectSlot', () => {
    const { onSelectSlot } = renderPicker({ slots: [FREE] });

    fireEvent.click(screen.getByTestId('schedule-slot-own-slot-own'));
    fireEvent.click(screen.getByText('Reservado por você'));
    expect(onSelectSlot).not.toHaveBeenCalled();

    // O horario livre ao lado continua selecionavel.
    fireEvent.click(screen.getByTestId('schedule-slot-slot-free'));
    expect(onSelectSlot).toHaveBeenCalledTimes(1);
    expect(onSelectSlot).toHaveBeenCalledWith(FREE);
  });

  it('mesmo id nas duas listas aparece uma vez, como reservado, nunca como opcao clicavel', () => {
    const duplicado: AvailabilitySlot = {
      id: OWN.id,
      startAt: OWN.startAt,
      endAt: OWN.endAt,
      isBlocked: false,
    };
    const { onSelectSlot } = renderPicker({ slots: [duplicado] });

    expect(screen.queryByTestId('schedule-slot-slot-own')).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('schedule-slot-own-slot-own'));
    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  it('saldo zero continua valendo so para o horario livre', () => {
    renderPicker({ slots: [FREE], isDisabled: true, disabledReasonId: 'insufficient-credits-title' });

    const free = screen.getByTestId('schedule-slot-slot-free');
    expect(free).toBeDisabled();
    expect(free).toHaveAttribute('aria-describedby', 'insufficient-credits-title');

    const own = screen.getByTestId('schedule-slot-own-slot-own');
    expect(own).not.toHaveAttribute('aria-describedby');
    expect(own).toHaveTextContent('Reservado por você');
  });
});

describe('CalendarView - reserva propria do aluno', () => {
  it('dia so com horario proprio nao ganha marcador de disponivel', () => {
    render(<CalendarView {...CALENDAR_BASE} ownSlotsByDate={{ '2099-01-15': [OWN] }} />);

    const day = screen.getByTestId('calendar-view-day-2099-01-15');
    expect(screen.queryByTestId('calendar-view-day-available-2099-01-15')).not.toBeInTheDocument();
    expect(day.getAttribute('aria-label')).not.toContain('horários disponíveis');
    expect(screen.getByTestId('calendar-view-day-own-2099-01-15')).toBeInTheDocument();
    expect(day).toHaveAttribute('aria-label', expect.stringContaining('horário reservado por você'));
    expect(screen.getByText('Dias com horário reservado por você')).toBeInTheDocument();
  });

  it('id proprio que tambem veio na lista livre nao conta como disponivel', () => {
    const duplicado: AvailabilitySlot = {
      id: OWN.id,
      startAt: OWN.startAt,
      endAt: OWN.endAt,
      isBlocked: false,
    };
    render(
      <CalendarView
        {...CALENDAR_BASE}
        slotsByDate={{ '2099-01-15': [duplicado], '2099-01-16': [{ ...FREE, id: 'slot-dia-16' }] }}
        ownSlotsByDate={{ '2099-01-15': [OWN] }}
      />,
    );

    expect(screen.queryByTestId('calendar-view-day-available-2099-01-15')).not.toBeInTheDocument();
    expect(screen.getByTestId('calendar-view-day-own-2099-01-15')).toBeInTheDocument();
    // Dia com horario livre de verdade segue marcado.
    expect(screen.getByTestId('calendar-view-day-available-2099-01-16')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-view-day-2099-01-16')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('horários disponíveis'),
    );
  });

  it('sem a prop a grade fica como antes, sem legenda de reserva propria', () => {
    render(<CalendarView {...CALENDAR_BASE} />);

    expect(screen.queryByText('Dias com horário reservado por você')).not.toBeInTheDocument();
    expect(screen.getByText('Dias com horários disponíveis')).toBeInTheDocument();
  });
});

describe('useOwnReservations - falha nunca expoe horario proprio como livre', () => {
  beforeEach(() => {
    mocks.getOwnReservedSlots.mockReset();
  });

  const renderReservations = (timeZone = 'UTC') =>
    renderHook(() => useOwnReservations({ currentMonth: 0, currentYear: 2099, timeZone }));

  it('excecao na leitura resulta em lista vazia, sem relancar', async () => {
    mocks.getOwnReservedSlots.mockImplementation(() => {
      throw new Error('falha sincrona');
    });

    const { result } = renderReservations();

    await waitFor(() => expect(mocks.getOwnReservedSlots).toHaveBeenCalledWith('2099-01', 'UTC'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.ownSlots).toEqual([]);
    expect(result.current.ownSlotsByDate).toEqual({});
  });

  it('erro devolvido pela action resulta em lista vazia', async () => {
    mocks.getOwnReservedSlots.mockResolvedValue({ data: null, error: 'Não autenticado', code: 'UNAUTHORIZED' });

    const { result } = renderReservations();

    await waitFor(() => expect(mocks.getOwnReservedSlots).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.ownSlots).toEqual([]);
  });

  it('agrupa a reserva pelo dia civil no fuso do aluno', async () => {
    const madrugada: OwnReservedSlot = { ...OWN, id: 'slot-madrugada', startAt: '2099-01-15T01:00:00.000Z' };
    mocks.getOwnReservedSlots.mockResolvedValue({ data: [madrugada], error: null, code: null });

    const { result } = renderReservations('America/Sao_Paulo');

    await waitFor(() => expect(result.current.ownSlotsByDate['2099-01-14']).toEqual([madrugada]));
    expect(result.current.ownSlotsByDate['2099-01-15']).toBeUndefined();
  });
});
