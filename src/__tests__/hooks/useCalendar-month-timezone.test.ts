/**
 * GAP-08 - `useCalendar` pede o mes navegado junto com o fuso do aluno.
 *
 * O hook ja abria no mes civil do fuso e agrupava por dia civil (GAP-07), mas
 * chamava `getAvailability(monthKey)` sem o fuso: a action pedia o mes em dias
 * UTC e os horarios da borda do mes sumiam da grade.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCalendar, type AvailabilitySlot } from '@/hooks/useCalendar';

const mocks = vi.hoisted(() => ({
  getAvailability: vi.fn(),
}));

vi.mock('@/actions/sessions', () => ({
  getAvailability: mocks.getAvailability,
}));

const S_BORDA: AvailabilitySlot = {
  id: 's-borda',
  startAt: '2026-10-01T02:30:00.000Z',
  endAt: '2026-10-01T03:20:00.000Z',
  isBlocked: false,
};

function congelarRelogio(instante: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instante));
}

describe('useCalendar - mes civil pedido com o fuso (GAP-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAvailability.mockResolvedValue({ data: [], error: null, code: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('RED: U1 Sao Paulo pede 2026-09 com o fuso', async () => {
    congelarRelogio('2026-09-10T12:00:00.000Z');
    const { result } = renderHook(() => useCalendar({ timeZone: 'America/Sao_Paulo' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.getAvailability.mock.calls[0][0]).toBe('2026-09');
    expect(mocks.getAvailability.mock.calls[0][1]).toBe('America/Sao_Paulo');
  });

  it('RED: U2 Kiritimati ja em outubro local pede 2026-10 com o fuso', async () => {
    congelarRelogio('2026-09-30T12:00:00.000Z');
    const { result } = renderHook(() => useCalendar({ timeZone: 'Pacific/Kiritimati' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.currentMonth).toBe(9);
    expect(mocks.getAvailability.mock.calls[0][0]).toBe('2026-10');
    expect(mocks.getAvailability.mock.calls[0][1]).toBe('Pacific/Kiritimati');
  });

  it('RED: U3 avancar de dezembro pede 2027-01 com o fuso', async () => {
    congelarRelogio('2026-12-10T12:00:00.000Z');
    const { result } = renderHook(() => useCalendar({ timeZone: 'America/Sao_Paulo' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.nextMonth());
    await waitFor(() => expect(mocks.getAvailability).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const ultima = mocks.getAvailability.mock.lastCall;
    expect(ultima?.[0]).toBe('2027-01');
    expect(ultima?.[1]).toBe('America/Sao_Paulo');
  });

  it('REGRESSAO: U4 slot da borda cai no ultimo dia civil do mes', async () => {
    congelarRelogio('2026-09-10T12:00:00.000Z');
    mocks.getAvailability.mockResolvedValue({ data: [S_BORDA], error: null, code: null });
    const { result } = renderHook(() => useCalendar({ timeZone: 'America/Sao_Paulo' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.slotsByDate['2026-09-30']).toHaveLength(1);
    expect(result.current.slotsByDate['2026-10-01']).toBeUndefined();
  });

  it('REGRESSAO: U5 sem fuso pede o mes sem segundo argumento definido', async () => {
    congelarRelogio('2026-09-10T12:00:00.000Z');
    const { result } = renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.getAvailability.mock.calls[0][0]).toBe('2026-09');
    expect(mocks.getAvailability.mock.calls[0][1]).toBeUndefined();
  });

  it('CONTROLE: U6 desligado nao busca nada', async () => {
    renderHook(() => useCalendar({ enabled: false, timeZone: 'America/Sao_Paulo' }));
    await act(async () => {});

    expect(mocks.getAvailability).not.toHaveBeenCalled();
  });
});
