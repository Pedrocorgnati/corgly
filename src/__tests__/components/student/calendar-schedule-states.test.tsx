import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/test/utils';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  prevMonth: vi.fn(),
  nextMonth: vi.fn(),
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

import { CalendarSchedule } from '@/components/student/calendar-schedule';

const AVAILABLE_SLOT = {
  id: 'slot-credit-state',
  startAt: '2099-01-15T13:00:00.000Z',
  endAt: '2099-01-15T13:50:00.000Z',
  isBlocked: false,
};

interface CalendarStateOverrides {
  isLoading?: boolean;
  error?: string | null;
  slotsByDate?: Record<string, typeof AVAILABLE_SLOT[]>;
}

function calendarState(overrides: CalendarStateOverrides = {}) {
  return {
    currentMonth: 0,
    currentYear: 2099,
    slots: [],
    slotsByDate: {},
    isLoading: false,
    error: null,
    prevMonth: mocks.prevMonth,
    nextMonth: mocks.nextMonth,
    refresh: mocks.refresh,
    ...overrides,
  };
}

function renderSchedule(creditBalance = 1) {
  return render(
    <CalendarSchedule
      creditBalance={creditBalance}
      studentTimezone="America/Sao_Paulo"
      adminTimezone="Europe/Rome"
    />,
  );
}

describe('CalendarSchedule: estados de carregamento, vazio e erro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useCalendar.mockReturnValue(calendarState());
    mocks.useTimezone.mockReturnValue({
      studentTz: 'America/Sao_Paulo',
      adminTz: 'Europe/Rome',
      formatDualTz: vi.fn(),
    });
  });

  it('mostra os esqueletos do calendario e dos horarios durante o carregamento', () => {
    mocks.useCalendar.mockReturnValue(calendarState({ isLoading: true }));

    renderSchedule();

    expect(screen.getByTestId('calendar-view-loading')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('schedule-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schedule-error')).not.toBeInTheDocument();
  });

  it('mostra o estado vazio depois que o aluno escolhe um dia sem horarios', async () => {
    const { user } = renderSchedule();

    await user.click(screen.getByTestId('calendar-view-day-2099-01-15'));

    expect(screen.getByTestId('schedule-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('schedule-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schedule-error')).not.toBeInTheDocument();
  });

  it('mostra o erro recuperavel e permite repetir a busca', async () => {
    mocks.useCalendar.mockReturnValue(
      calendarState({ error: 'Não foi possível carregar os horários.' }),
    );
    const { user } = renderSchedule();

    expect(screen.getByTestId('schedule-error')).toHaveTextContent(
      'Não foi possível carregar os horários.',
    );
    expect(screen.queryByTestId('schedule-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schedule-empty')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('schedule-retry-button'));

    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('desabilita os horarios e associa a razao visivel quando o saldo e zero', async () => {
    mocks.useCalendar.mockReturnValue(
      calendarState({ slotsByDate: { '2099-01-15': [AVAILABLE_SLOT] } }),
    );
    const { user } = renderSchedule(0);

    await user.click(screen.getByTestId('calendar-view-day-2099-01-15'));

    const slot = screen.getByTestId(`schedule-slot-${AVAILABLE_SLOT.id}`);
    expect(slot).toBeDisabled();
    expect(slot).toHaveAttribute('aria-describedby', 'insufficient-credits-title');
    expect(slot).toHaveClass('cursor-not-allowed', 'opacity-60');
    expect(screen.getByTestId('insufficient-credits-gate')).toHaveTextContent(
      'Créditos insuficientes para agendar',
    );
    await user.click(slot);
    expect(screen.queryByTestId('schedule-confirm-slot-button')).not.toBeInTheDocument();
  });

  it('mantem os horarios selecionaveis quando ha saldo positivo', async () => {
    mocks.useCalendar.mockReturnValue(
      calendarState({ slotsByDate: { '2099-01-15': [AVAILABLE_SLOT] } }),
    );
    const { user } = renderSchedule(1);

    await user.click(screen.getByTestId('calendar-view-day-2099-01-15'));

    const slot = screen.getByTestId(`schedule-slot-${AVAILABLE_SLOT.id}`);
    expect(slot).toBeEnabled();
    expect(slot).not.toHaveAttribute('aria-describedby');
    expect(slot).not.toHaveClass('cursor-not-allowed', 'opacity-60');
    await user.click(slot);
    expect(screen.getByTestId('schedule-confirm-slot-button')).toBeInTheDocument();
  });
});

describe('CalendarSchedule: horario vencido com a tela aberta', () => {
  const NOW = new Date('2026-09-11T12:00:00.000Z');
  const EXPIRED_SLOT = {
    id: 'slot-expired',
    startAt: '2026-09-11T11:00:00.000Z',
    endAt: '2026-09-11T11:50:00.000Z',
    isBlocked: false,
  };
  const SOON_SLOT = {
    id: 'slot-soon',
    startAt: '2026-09-11T12:30:00.000Z',
    endAt: '2026-09-11T13:20:00.000Z',
    isBlocked: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mocks.useTimezone.mockReturnValue({
      studentTz: 'America/Sao_Paulo',
      adminTz: 'Europe/Rome',
      formatDualTz: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('recusa o clique em horario que ja passou e recarrega a lista', async () => {
    mocks.useCalendar.mockReturnValue({
      ...calendarState({ slotsByDate: { '2026-09-11': [EXPIRED_SLOT] } }),
      currentMonth: 8,
      currentYear: 2026,
    });
    const { user } = renderSchedule(1);

    await user.click(screen.getByTestId('calendar-view-day-2026-09-11'));
    await user.click(screen.getByTestId(`schedule-slot-${EXPIRED_SLOT.id}`));

    expect(screen.queryByTestId('schedule-confirm-slot-button')).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('descarta a selecao e o modal quando o horario escolhido sai da lista', async () => {
    const state = {
      ...calendarState({ slotsByDate: { '2026-09-11': [SOON_SLOT] } }),
      currentMonth: 8,
      currentYear: 2026,
    };
    mocks.useCalendar.mockReturnValue(state);
    const { user, rerender } = renderSchedule(1);

    await user.click(screen.getByTestId('calendar-view-day-2026-09-11'));
    await user.click(screen.getByTestId(`schedule-slot-${SOON_SLOT.id}`));
    await user.click(screen.getByTestId('schedule-confirm-slot-button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // O `useCalendar` real remove o slot no vencimento; aqui o mock simula isso.
    mocks.useCalendar.mockReturnValue({ ...state, slotsByDate: {} });
    rerender(
      <CalendarSchedule
        creditBalance={1}
        studentTimezone="America/Sao_Paulo"
        adminTimezone="Europe/Rome"
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('schedule-confirm-slot-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId(`schedule-slot-${SOON_SLOT.id}`)).not.toBeInTheDocument();
  });
});
