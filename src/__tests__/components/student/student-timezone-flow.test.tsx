import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SLOT = {
  id: 'slot-1',
  startAt: '2026-09-11T00:00:00.000Z',
  endAt: '2026-09-11T01:00:00.000Z',
  isBlocked: false,
};

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  useCalendar: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/hooks/useCalendar', () => ({
  useCalendar: mocks.useCalendar,
}));

// Item 036: a leitura das reservas proprias tem teste proprio
// (own-reserved-slot.test.tsx); aqui fica vazia e sincrona.
vi.mock('@/hooks/useOwnReservations', () => ({
  useOwnReservations: () => ({ ownSlots: [], ownSlotsByDate: {}, refresh: vi.fn() }),
}));

vi.mock('@/components/calendar/CalendarView', () => ({
  CalendarView: ({ onSelectDate, timeZone }: { onSelectDate: (date: string) => void; timeZone?: string }) => (
    <button data-testid="calendar-select-date" data-time-zone={timeZone} onClick={() => onSelectDate('2026-09-10')}>
      selecionar data
    </button>
  ),
}));

vi.mock('@/components/calendar/SlotPicker', () => ({
  SlotPicker: ({
    slots,
    studentTz,
    adminTz,
    onSelectSlot,
  }: {
    slots: typeof SLOT[];
    studentTz: string;
    adminTz: string;
    onSelectSlot: (slot: typeof SLOT) => void;
  }) => (
    <div
      data-testid="slot-picker"
      data-student-timezone={studentTz}
      data-admin-timezone={adminTz}
    >
      {slots[0] && (
        <button data-testid="slot-picker-select" onClick={() => onSelectSlot(slots[0])}>
          selecionar slot
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/components/calendar/BookingConfirmModal', () => ({
  BookingConfirmModal: ({
    open,
    studentTz,
    adminTz,
  }: {
    open: boolean;
    studentTz: string;
    adminTz: string;
  }) => open ? (
    <div
      data-testid="booking-modal"
      data-student-timezone={studentTz}
      data-admin-timezone={adminTz}
    />
  ) : null,
}));

import { CalendarSchedule } from '@/components/student/calendar-schedule';
import { useTimezone } from '@/hooks/useTimezone';

describe('CalendarSchedule - propagação do fuso persistido', () => {
  // GAP-028: o hook `useTimezone` roda real neste describe (nenhum `vi.mock`),
  // e a rede fica proibida para provar que o fluxo do aluno nao le
  // `/api/v1/admin/settings`.
  const espionarFetch = () => vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('rede proibida neste teste'));
  let fetchSpy: ReturnType<typeof espionarFetch>;

  afterEach(() => {
    vi.useRealTimers();
    fetchSpy.mockRestore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = espionarFetch();
    // Relogio antes do SLOT: a selecao recusa horario ja vencido.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
    mocks.useCalendar.mockReturnValue({
      currentMonth: 8,
      currentYear: 2026,
      slots: [SLOT],
      slotsByDate: { '2026-09-10': [SLOT] },
      isLoading: false,
      error: null,
      prevMonth: vi.fn(),
      nextMonth: vi.fn(),
      refresh: vi.fn(),
    });
  });

  it('envia o mesmo User.timezone ao agrupamento, à lista e à confirmação', () => {
    render(
      <CalendarSchedule
        creditBalance={1}
        studentTimezone="America/Sao_Paulo"
        adminTimezone="Europe/Rome"
      />,
    );

    const calendario = screen.getByTestId('calendar-select-date');
    expect(calendario).toHaveAttribute('data-time-zone', 'America/Sao_Paulo');
    expect(calendario).not.toHaveAttribute('data-time-zone', 'Europe/Rome');

    expect(mocks.useCalendar).toHaveBeenCalledWith({
      timeZone: 'America/Sao_Paulo',
    });
    expect(screen.getByTestId('slot-picker')).toHaveAttribute(
      'data-student-timezone',
      'America/Sao_Paulo',
    );
    expect(screen.getByTestId('slot-picker')).toHaveAttribute(
      'data-admin-timezone',
      'Europe/Rome',
    );

    fireEvent.click(screen.getByTestId('calendar-select-date'));
    fireEvent.click(screen.getByTestId('slot-picker-select'));
    fireEvent.click(screen.getByTestId('schedule-confirm-slot-button'));

    expect(screen.getByTestId('booking-modal')).toHaveAttribute(
      'data-student-timezone',
      'America/Sao_Paulo',
    );
    expect(screen.getByTestId('booking-modal')).toHaveAttribute(
      'data-admin-timezone',
      'Europe/Rome',
    );

    expect(vi.isMockFunction(globalThis.fetch)).toBe(true);
    const chamadasAdmin = fetchSpy.mock.calls.filter(([alvo]) =>
      String(alvo instanceof Request ? alvo.url : alvo).includes('/api/v1/admin/settings'),
    );
    expect(chamadasAdmin).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('formata o horario dual pelo useTimezone real, com os dois fusos no resultado', () => {
    const instante = new Date('2026-09-11T00:00:00.000Z');
    const dual = renderHook(() => useTimezone('America/Sao_Paulo', 'Europe/Rome')).result.current.formatDualTz(instante);
    const invertido = renderHook(() => useTimezone('Europe/Rome', 'America/Sao_Paulo')).result.current.formatDualTz(instante);
    expect(dual.indexOf('21:00')).toBeGreaterThanOrEqual(0);
    expect(dual.indexOf('02:00')).toBeGreaterThan(dual.indexOf('21:00'));
    expect(invertido.indexOf('02:00')).toBeGreaterThanOrEqual(0);
    expect(invertido.indexOf('21:00')).toBeGreaterThan(invertido.indexOf('02:00'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
