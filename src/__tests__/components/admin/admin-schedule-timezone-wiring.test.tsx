/**
 * GAP-08 - fiacao do fuso do professor no painel de agenda.
 *
 * `AdminScheduleClient` recebe `adminTimezone` da pagina e o repassa ao hook
 * (mes civil e agrupamento), ao `AdminCalendar` (horario de cada slot) e ao
 * painel de detalhe. Sem a prop, o comportamento de antes fica igual.
 */
import type { ReactElement } from 'react';
import { render, screen, fireEvent, waitFor } from '@/test/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import ptBR from '../../../../i18n/messages/pt-BR.json';

const mocks = vi.hoisted(() => ({
  getAdminAvailability: vi.fn(),
  getAvailability: vi.fn(),
}));

vi.mock('@/actions/sessions', () => ({
  getAdminAvailability: mocks.getAdminAvailability,
  getAvailability: mocks.getAvailability,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { AdminScheduleClient } from '@/app/(admin)/admin/schedule/schedule-client';

function renderizar(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function congelarRelogio(instante: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instante));
}

async function selecionarDia(dateKey: string) {
  await waitFor(() => {
    expect(screen.getByTestId(`calendar-view-day-${dateKey}`)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId(`calendar-view-day-${dateKey}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminAvailability.mockResolvedValue({ data: [], error: null, code: null });
  mocks.getAvailability.mockResolvedValue({ data: [], error: null, code: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AdminScheduleClient - fuso do professor (GAP-08)', () => {
  it('RED: W1 Kiritimati ja em outubro local pede 2026-10 com o fuso', async () => {
    congelarRelogio('2026-09-30T12:00:00.000Z');
    renderizar(<AdminScheduleClient adminTimezone="Pacific/Kiritimati" />);
    await waitFor(() => expect(mocks.getAdminAvailability).toHaveBeenCalled());
    await screen.findByTestId('calendar-view');

    expect(mocks.getAdminAvailability.mock.calls[0][0]).toBe('2026-10');
    expect(mocks.getAdminAvailability.mock.calls[0][1]).toBe('Pacific/Kiritimati');
  });

  it('RED: W2 horario do slot aparece no fuso do professor', async () => {
    congelarRelogio('2026-09-10T12:00:00.000Z');
    mocks.getAdminAvailability.mockResolvedValue({
      data: [
        {
          id: 'slot-w2',
          startAt: '2026-09-20T02:30:00.000Z',
          endAt: '2026-09-20T03:20:00.000Z',
          isBlocked: false,
          session: null,
        },
      ],
      error: null,
      code: null,
    });
    renderizar(<AdminScheduleClient adminTimezone="Pacific/Kiritimati" />);
    await selecionarDia('2026-09-20');

    expect(screen.getByTestId('admin-calendar-slot-slot-w2')).toHaveTextContent('16:30');
  });

  it('REGRESSAO: W3 sem prop pede o mes sem segundo argumento definido', async () => {
    congelarRelogio('2026-09-10T12:00:00.000Z');
    renderizar(<AdminScheduleClient />);
    await waitFor(() => expect(mocks.getAdminAvailability).toHaveBeenCalled());
    await screen.findByTestId('calendar-view');

    expect(mocks.getAdminAvailability.mock.calls[0][0]).toBe('2026-09');
    expect(mocks.getAdminAvailability.mock.calls[0][1]).toBeUndefined();
  });

  it('RED: W4 detalhe do slot mostra o horario no fuso do professor', async () => {
    congelarRelogio('2026-08-20T12:00:00.000Z');
    mocks.getAdminAvailability.mockResolvedValue({
      data: [
        {
          id: 'slot-w4',
          startAt: '2026-09-01T02:30:00.000Z',
          endAt: '2026-09-01T03:20:00.000Z',
          isBlocked: false,
          session: null,
        },
      ],
      error: null,
      code: null,
    });
    renderizar(<AdminScheduleClient adminTimezone="America/Sao_Paulo" />);
    await selecionarDia('2026-08-31');
    fireEvent.click(screen.getByTestId('admin-calendar-slot-slot-w4'));

    const detalhe = screen.getByTestId('admin-schedule-slot-detail-time').textContent;
    expect(detalhe).toContain('23:30');
    expect(detalhe).not.toContain('02:30');
  });
});
