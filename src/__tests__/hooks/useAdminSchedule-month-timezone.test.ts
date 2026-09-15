/**
 * GAP-08 - `useAdminSchedule` abre no mes civil do fuso do professor, pede o mes
 * com esse fuso e agrupa cada slot no dia civil local.
 *
 * O hook abria no mes do relogio do runtime, chamava `getAdminAvailability`
 * sem fuso e agrupava por `startAt.slice(0, 10)`, o dia UTC.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAdminSchedule } from '@/hooks/useAdminSchedule';

const mocks = vi.hoisted(() => ({
  getAdminAvailability: vi.fn(),
}));

vi.mock('@/actions/sessions', () => ({
  getAdminAvailability: mocks.getAdminAvailability,
}));

const S_BORDA = {
  id: 's-borda',
  startAt: '2026-10-01T02:30:00.000Z',
  endAt: '2026-10-01T03:20:00.000Z',
  isBlocked: false,
  session: null,
};

function congelarRelogio(instante: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instante));
}

describe('useAdminSchedule - mes civil do professor (GAP-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminAvailability.mockResolvedValue({ data: [], error: null, code: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('RED: S1 Kiritimati ja em outubro local abre e pede 2026-10 com o fuso', async () => {
    congelarRelogio('2026-09-30T12:00:00.000Z');
    const { result } = renderHook(() => useAdminSchedule({ timeZone: 'Pacific/Kiritimati' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.currentMonth).toBe(9);
    expect(mocks.getAdminAvailability.mock.calls[0][0]).toBe('2026-10');
    expect(mocks.getAdminAvailability.mock.calls[0][1]).toBe('Pacific/Kiritimati');
  });

  it('RED: S2 Sao Paulo agrupa o slot da borda no ultimo dia civil do mes', async () => {
    congelarRelogio('2026-09-10T12:00:00.000Z');
    mocks.getAdminAvailability.mockResolvedValue({ data: [S_BORDA], error: null, code: null });
    const { result } = renderHook(() => useAdminSchedule({ timeZone: 'America/Sao_Paulo' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.slotsByDate['2026-09-30']).toHaveLength(1);
    expect(result.current.slotsByDate['2026-10-01']).toBeUndefined();
  });

  it('REGRESSAO: S3 sem opcoes mantem o mes e o agrupamento de antes', async () => {
    congelarRelogio('2026-09-10T12:00:00.000Z');
    mocks.getAdminAvailability.mockResolvedValue({ data: [S_BORDA], error: null, code: null });
    const { result } = renderHook(() => useAdminSchedule());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.getAdminAvailability.mock.calls[0][0]).toBe('2026-09');
    expect(mocks.getAdminAvailability.mock.calls[0][1]).toBeUndefined();
    expect(result.current.slotsByDate['2026-10-01']).toHaveLength(1);
  });
});
