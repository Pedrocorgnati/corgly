/**
 * GAP-07 (item 028) - o "hoje" do modal de reagendamento e o do aluno.
 *
 * `RescheduleFlow` busca horarios com `useCalendar({ timeZone: studentTimezone })`
 * mas montava o `CalendarView` sem fuso, entao a grade marcava hoje pelo
 * runtime. Em 2026-09-30T15:30Z o aluno em Asia/Tokyo ja esta em
 * 2026-10-01 00:30, enquanto o runtime (TZ=UTC) ainda esta em 2026-09-30:
 * outubro precisa marcar o dia 1 como hoje e setembro precisa bloquear o dia 30.
 *
 * `useCalendar` e mockado para fixar o mes exibido; mocks de sessions e sonner
 * seguem `reschedule-flow-load-error.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils';
import ptBR from '../../../../i18n/messages/pt-BR.json';

const mocks = vi.hoisted(() => ({
  getAvailability: vi.fn(),
  rescheduleSession: vi.fn(),
  useCalendar: vi.fn(),
}));

vi.mock('@/actions/sessions', () => ({
  getAvailability: mocks.getAvailability,
  rescheduleSession: mocks.rescheduleSession,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/hooks/useCalendar', () => ({ useCalendar: mocks.useCalendar }));

import { RescheduleFlow } from '@/components/calendar/RescheduleFlow';

const HOJE = ptBR.calendar.view.today;
const AGORA = '2026-09-30T15:30:00.000Z';
const DATA = '2026-10-02';

const SESSAO = { id: 'sessao-1', startAt: '2026-10-05T01:00:00.000Z' };

const SLOT_LIVRE = {
  id: 'slot-livre',
  startAt: '2026-10-02T01:00:00.000Z',
  endAt: '2026-10-02T02:00:00.000Z',
  isBlocked: false,
};

function armarCalendario(currentMonth: number) {
  mocks.useCalendar.mockReturnValue({
    currentMonth,
    currentYear: 2026,
    slotsByDate: { [DATA]: [SLOT_LIVRE] },
    isLoading: false,
    error: null,
    prevMonth: vi.fn(),
    nextMonth: vi.fn(),
    refresh: vi.fn(),
  });
}

function renderizar() {
  return render(
    <RescheduleFlow
      session={SESSAO}
      studentTimezone="Asia/Tokyo"
      adminTimezone="Europe/Rome"
      open
      onOpenChange={vi.fn()}
      onRescheduled={vi.fn()}
    />,
  );
}

function diasMarcadosComoHoje(): string[] {
  return screen
    .getAllByRole('gridcell')
    .filter((el) => (el.getAttribute('aria-label') ?? '').startsWith(`${HOJE}, `))
    .map((el) => (el.getAttribute('data-testid') ?? '').replace('calendar-view-day-', ''));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(AGORA));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RescheduleFlow - hoje civil do aluno (GAP-07)', () => {
  it('RED 028 [ST009]: outubro marca 2026-10-01 como hoje', () => {
    armarCalendario(9);
    renderizar();
    expect(diasMarcadosComoHoje()).toEqual(['2026-10-01']);
  });

  it('RED 028 [ST009]: setembro desabilita 2026-09-30', () => {
    armarCalendario(8);
    renderizar();
    expect(screen.getByTestId('calendar-view-day-2026-09-30')).toBeDisabled();
  });

  it('CONTROLE: 2026-10-02 aparece com horario disponivel', () => {
    armarCalendario(9);
    renderizar();
    expect(screen.getByTestId('calendar-view-day-available-2026-10-02')).toBeInTheDocument();
  });
});
