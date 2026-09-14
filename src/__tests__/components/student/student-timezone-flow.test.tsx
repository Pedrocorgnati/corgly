import { fireEvent, render, screen } from '@testing-library/react';
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
  useTimezone: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/hooks/useCalendar', () => ({
  useCalendar: mocks.useCalendar,
}));

vi.mock('@/hooks/useTimezone', () => ({
  useTimezone: mocks.useTimezone,
}));

// Item 036: a leitura das reservas proprias tem teste proprio
// (own-reserved-slot.test.tsx); aqui fica vazia e sincrona.
vi.mock('@/hooks/useOwnReservations', () => ({
  useOwnReservations: () => ({ ownSlots: [], ownSlotsByDate: {}, refresh: vi.fn() }),
}));

vi.mock('@/components/calendar/CalendarView', () => ({
  CalendarView: ({ onSelectDate }: { onSelectDate: (date: string) => void }) => (
    <button data-testid="calendar-select-date" onClick={() => onSelectDate('2026-09-10')}>
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

describe('CalendarSchedule - propagação do fuso persistido', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.useTimezone.mockImplementation((studentTimezone: string, adminTimezone: string) => ({
      studentTz: studentTimezone,
      adminTz: adminTimezone,
      formatDualTz: vi.fn(),
    }));
  });

  it('envia o mesmo User.timezone ao agrupamento, à lista e à confirmação', () => {
    render(
      <CalendarSchedule
        creditBalance={1}
        studentTimezone="America/Sao_Paulo"
        adminTimezone="Europe/Rome"
      />,
    );

    expect(mocks.useCalendar).toHaveBeenCalledWith({
      timeZone: 'America/Sao_Paulo',
    });
    expect(mocks.useTimezone).toHaveBeenCalledWith(
      'America/Sao_Paulo',
      'Europe/Rome',
    );
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
  });
});
