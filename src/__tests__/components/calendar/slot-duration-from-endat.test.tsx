import { describe, expect, it, vi } from 'vitest';

import { render, screen, within } from '@/test/utils';
import { BookingConfirmModal } from '@/components/calendar/BookingConfirmModal';
import { SlotPicker } from '@/components/calendar/SlotPicker';
import type { AvailabilitySlot } from '@/hooks/useCalendar';
import { slotDurationMinutes } from '@/lib/bookings/slot-duration';
import { AVAILABILITY_SLOT_STEP_MINUTES, BOOKING_RULES } from '@/lib/constants';

vi.mock('@/actions/sessions', () => ({
  bookSession: vi.fn(),
}));

vi.mock('@/components/ui/timezone-display', () => ({
  TimezoneDisplay: ({ time }: { time: string }) => <span>{time}</span>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

// Item 035: ate 2026-09-11 o caminho do aluno exibia um 50 cravado e nunca lia
// `endAt`. Os horarios abaixo tem duracao diferente da grade padrao de proposito:
// com o literal de volta, "30 min" viraria "50 min" e o teste quebraria.
const thirtyMinutes = {
  id: 'slot-30',
  startAt: '2026-06-20T14:00:00.000Z',
  endAt: '2026-06-20T14:30:00.000Z',
  isBlocked: false,
} as AvailabilitySlot;

const zeroLength = {
  id: 'slot-zero',
  startAt: '2026-06-20T15:00:00.000Z',
  endAt: '2026-06-20T15:00:00.000Z',
  isBlocked: false,
} as AvailabilitySlot;

function renderPicker(slots: AvailabilitySlot[]) {
  return render(
    <SlotPicker
      slots={slots}
      selectedSlotId={null}
      onSelectSlot={vi.fn()}
      studentTz="UTC"
      adminTz="UTC"
      isLoading={false}
      selectedDate="2026-06-20"
    />,
  );
}

function renderModal(slot: AvailabilitySlot) {
  return render(
    <BookingConfirmModal
      slot={slot}
      studentTz="UTC"
      adminTz="UTC"
      open
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  );
}

describe('slotDurationMinutes', () => {
  it('le endAt - startAt em minutos inteiros', () => {
    expect(slotDurationMinutes(thirtyMinutes)).toBe(30);
    expect(
      slotDurationMinutes({ startAt: '2026-06-20T14:00:00.000Z', endAt: '2026-06-20T14:44:40.000Z' }),
    ).toBe(45);
  });

  it('devolve null para duracao que nao pode ser exibida', () => {
    expect(slotDurationMinutes(zeroLength)).toBeNull();
    expect(
      slotDurationMinutes({ startAt: '2026-06-20T14:00:00.000Z', endAt: '2026-06-20T13:10:00.000Z' }),
    ).toBeNull();
    expect(slotDurationMinutes({ startAt: '2026-06-20T14:00:00.000Z', endAt: 'nao-e-data' })).toBeNull();
    expect(
      slotDurationMinutes({ startAt: '2026-06-20T14:00:00.000Z', endAt: '2026-06-20T14:00:20.000Z' }),
    ).toBeNull();
  });
});

describe('passo da grade', () => {
  it('continua em 50 minutos e separado da estimativa de fim de sessao (55)', () => {
    expect(AVAILABILITY_SLOT_STEP_MINUTES).toBe(50);
    expect(BOOKING_RULES.SESSION_DURATION_MINUTES).toBe(55);
  });
});

describe('SlotPicker: duracao lida de endAt', () => {
  it('exibe a duracao do proprio horario no texto e no aria-label', () => {
    renderPicker([thirtyMinutes]);

    const option = screen.getByTestId('schedule-slot-slot-30');
    expect(option).toHaveTextContent('30 min');
    expect(option).not.toHaveTextContent('50 min');
    expect(option).toHaveAccessibleName('14:00, 30 minutos, 1 crédito');
  });

  it('omite a duracao invalida sem NaN, 0 ou negativo e mantem o horario selecionavel', () => {
    const onSelectSlot = vi.fn();
    render(
      <SlotPicker
        slots={[zeroLength]}
        selectedSlotId={null}
        onSelectSlot={onSelectSlot}
        studentTz="UTC"
        adminTz="UTC"
        isLoading={false}
        selectedDate="2026-06-20"
      />,
    );

    const option = screen.getByTestId('schedule-slot-slot-zero');
    expect(option).not.toHaveTextContent(/min/);
    expect(option).not.toHaveTextContent(/NaN/);
    expect(option).toHaveAccessibleName('15:00, 1 crédito');
    expect(option).toBeEnabled();

    option.click();
    expect(onSelectSlot).toHaveBeenCalledWith(zeroLength);
  });
});

describe('BookingConfirmModal: duracao lida de endAt', () => {
  it('exibe a duracao do proprio horario no resumo', () => {
    renderModal(thirtyMinutes);

    const duration = screen.getByTestId('modal-booking-confirm-duration');
    expect(duration).toHaveTextContent('30 minutos');
    expect(duration).not.toHaveTextContent('50');
  });

  it('omite a linha de duracao quando endAt e igual a startAt', () => {
    renderModal(zeroLength);

    const summary = screen.getByTestId('modal-booking-confirm-summary');
    expect(screen.queryByTestId('modal-booking-confirm-duration')).not.toBeInTheDocument();
    expect(within(summary).queryByText(/Duração/)).not.toBeInTheDocument();
    expect(summary).not.toHaveTextContent(/NaN|0 minutos/);
    expect(screen.getByTestId('modal-booking-confirm-submit-button')).toBeEnabled();
  });
});
