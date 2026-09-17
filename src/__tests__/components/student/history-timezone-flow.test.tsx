import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Slot livre num instante cujo dia civil difere entre os dois fusos:
 * `2026-09-11 21:00` em Sao Paulo e `2026-09-12 02:00` em Roma. O dia marcado
 * como disponivel no calendario da remarcacao prova qual fuso orienta a chave
 * de dia.
 */
const SLOT_LIVRE = {
  id: 'slot-livre-1',
  startAt: '2026-09-12T00:00:00.000Z',
  endAt: '2026-09-12T01:00:00.000Z',
  isBlocked: false,
};

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getCanonicalTimezone: vi.fn(),
  getSessions: vi.fn(),
  getAvailability: vi.fn(),
  rescheduleSession: vi.fn(),
  redirect: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/data/auth', () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock('@/lib/canonical-timezone', () => ({
  getCanonicalTimezone: mocks.getCanonicalTimezone,
}));

vi.mock('@/actions/sessions', () => ({
  getSessions: mocks.getSessions,
  getAvailability: mocks.getAvailability,
  rescheduleSession: mocks.rescheduleSession,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'pt-BR',
}));

vi.mock('@/components/shared', () => ({
  PageWrapper: ({ children, ...props }: PropsWithChildren<{ 'data-testid'?: string }>) => (
    <main {...props}>{children}</main>
  ),
}));

vi.mock('@/components/session/DocumentSearch', () => ({
  DocumentSearch: () => <div data-testid="document-search" />,
}));

import HistoryPage from '@/app/(student)/history/page';

describe('HistoryPage - fuso persistido do aluno', () => {
  // GAP-028 (D4): `RescheduleFlow`, `CalendarView`, `SlotPicker`,
  // `TimezoneDisplay`, `useCalendar`, `useTimezone` e `useDialogA11y` rodam
  // reais aqui. Somente rede e server actions ficam mockados, para que o
  // caminho do fuso seja provado pelo comportamento e nao por `data-*` de mock.
  const espionarFetch = () => vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('rede proibida neste teste'));
  let fetchSpy: ReturnType<typeof espionarFetch>;

  afterEach(() => {
    vi.useRealTimers();
    fetchSpy.mockRestore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = espionarFetch();
    // Relogio antes do SLOT_LIVRE: a selecao recusa horario ja vencido.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
    mocks.getAuthUser.mockResolvedValue({
      id: 'student-1',
      name: 'Aluna',
      email: 'student@example.test',
      role: 'STUDENT',
      creditBalance: 1,
      emailConfirmed: true,
      timezone: 'America/Sao_Paulo',
    });
    mocks.getCanonicalTimezone.mockResolvedValue('Europe/Rome');
    mocks.getAvailability.mockResolvedValue({ data: [SLOT_LIVRE], error: null });
    mocks.getSessions.mockResolvedValue({
      data: [{
        id: 'session-1',
        startAt: '2026-09-11T00:00:00.000Z',
        endAt: '2026-09-11T01:00:00.000Z',
        status: 'SCHEDULED',
        adminName: 'Professor',
      }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('formata o histórico e abre a remarcação com o mesmo User.timezone', async () => {
    render(<>{await HistoryPage({ searchParams: Promise.resolve({}) })}</>);

    expect(screen.getByTestId('session-card-session-1')).toHaveTextContent('21:00');

    fireEvent.click(screen.getByTestId('session-card-session-1-reschedule-button'));
    expect(await screen.findByTestId('modal-reschedule')).toBeInTheDocument();
    await waitFor(() => expect(mocks.getAvailability).toHaveBeenCalledWith('2026-09', 'America/Sao_Paulo'));
    expect(await screen.findByTestId('calendar-view-day-available-2026-09-11')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-view-day-available-2026-09-12')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('calendar-view-day-2026-09-11'));
    const slot = within(screen.getByTestId('modal-reschedule-picker')).getByTestId('schedule-slot-slot-livre-1');
    expect(slot).toHaveTextContent('21:00');
    expect(slot).toHaveTextContent('02:00');
    expect(mocks.getCanonicalTimezone).toHaveBeenCalledTimes(1);
    expect(mocks.rescheduleSession).not.toHaveBeenCalled();
    const chamadasAdmin = fetchSpy.mock.calls.filter(([alvo]) =>
      String(alvo instanceof Request ? alvo.url : alvo).includes('/api/v1/admin/settings'),
    );
    expect(chamadasAdmin).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
