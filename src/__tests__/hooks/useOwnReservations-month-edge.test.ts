/**
 * GAP-08 - `useOwnReservations` pede as reservas do mes com o fuso do aluno.
 *
 * O hook chamava `getOwnReservedSlots(monthKey)` sem o fuso, e a action pedia o
 * mes em dias UTC. Trocar o fuso com o mesmo mes na tela tambem nao disparava
 * nova leitura.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useOwnReservations, type UseOwnReservationsOptions } from '@/hooks/useOwnReservations';

const mocks = vi.hoisted(() => ({
  getOwnReservedSlots: vi.fn(),
}));

vi.mock('@/actions/sessions', () => ({
  getOwnReservedSlots: mocks.getOwnReservedSlots,
}));

const SETEMBRO_SP: UseOwnReservationsOptions = {
  currentMonth: 8,
  currentYear: 2026,
  timeZone: 'America/Sao_Paulo',
};

describe('useOwnReservations - mes pedido com o fuso (GAP-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOwnReservedSlots.mockResolvedValue({ data: [], error: null, code: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('RED: O1 Sao Paulo pede 2026-09 com o fuso', async () => {
    renderHook(() => useOwnReservations(SETEMBRO_SP));
    await waitFor(() => expect(mocks.getOwnReservedSlots).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(mocks.getOwnReservedSlots.mock.calls[0][0]).toBe('2026-09');
    expect(mocks.getOwnReservedSlots.mock.calls[0][1]).toBe('America/Sao_Paulo');
  });

  it('RED: O2 trocar o fuso com o mesmo mes pede de novo com o fuso novo', async () => {
    const { rerender } = renderHook((p: UseOwnReservationsOptions) => useOwnReservations(p), {
      initialProps: SETEMBRO_SP,
    });
    await waitFor(() => expect(mocks.getOwnReservedSlots).toHaveBeenCalledTimes(1));

    rerender({ ...SETEMBRO_SP, timeZone: 'Pacific/Kiritimati' });
    await waitFor(() => {
      const ultima = mocks.getOwnReservedSlots.mock.lastCall;
      expect(ultima?.[0]).toBe('2026-09');
      expect(ultima?.[1]).toBe('Pacific/Kiritimati');
    });
    await act(async () => {});
  });

  it('REGRESSAO: O3 reserva da borda cai no ultimo dia civil do mes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
    mocks.getOwnReservedSlots.mockResolvedValue({
      data: [
        {
          id: 'slot-borda',
          sessionId: 'sess-borda',
          startAt: '2026-10-01T01:40:00.000Z',
          endAt: '2026-10-01T02:30:00.000Z',
        },
      ],
      error: null,
      code: null,
    });
    const { result } = renderHook(() => useOwnReservations(SETEMBRO_SP));

    await waitFor(() => expect(result.current.ownSlotsByDate['2026-09-30']).toHaveLength(1));
  });

  it('CONTROLE: O4 erro da leitura vira lista vazia', async () => {
    mocks.getOwnReservedSlots.mockResolvedValue({ data: null, error: 'falha', code: null });
    const { result } = renderHook(() => useOwnReservations(SETEMBRO_SP));
    await waitFor(() => expect(mocks.getOwnReservedSlots).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(result.current.ownSlots).toEqual([]);
  });
});
