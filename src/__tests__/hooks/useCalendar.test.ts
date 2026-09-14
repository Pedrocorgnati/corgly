import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCalendar, type AvailabilitySlot } from '@/hooks/useCalendar';

const mocks = vi.hoisted(() => ({
  getAvailability: vi.fn(),
}));

vi.mock('@/actions/sessions', () => ({
  getAvailability: mocks.getAvailability,
}));

const NIGHT_SLOT: AvailabilitySlot = {
  id: 'slot-21h-sao-paulo',
  startAt: '2026-09-11T00:00:00.000Z',
  endAt: '2026-09-11T01:00:00.000Z',
  isBlocked: false,
};

describe('useCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAvailability.mockResolvedValue({
      data: [NIGHT_SLOT],
      error: null,
      code: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('agrupa no dia do fuso persistido quando o runtime está em outro fuso', async () => {
    // Relogio antes do slot: sem isso a fixture ja teria passado e sairia da lista.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));

    const { result } = renderHook(() =>
      useCalendar({ timeZone: 'America/Sao_Paulo' }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.slotsByDate['2026-09-10']).toEqual([NIGHT_SLOT]);
    expect(result.current.slotsByDate['2026-09-11']).toBeUndefined();
  });

  it('remove da lista o horario que vence com a tela ja carregada', async () => {
    const LATER_SLOT: AvailabilitySlot = {
      id: 'slot-22h-sao-paulo',
      startAt: '2026-09-11T01:00:00.000Z',
      endAt: '2026-09-11T01:50:00.000Z',
      isBlocked: false,
    };
    mocks.getAvailability.mockResolvedValue({
      data: [NIGHT_SLOT, LATER_SLOT],
      error: null,
      code: null,
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-09-10T23:59:00.000Z'));

    const { result } = renderHook(() =>
      useCalendar({ timeZone: 'America/Sao_Paulo' }),
    );

    // `waitFor` do testing-library depende de setTimeout real; com o timer
    // falso, a resposta mockada e drenada dentro do `act`.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.slots).toEqual([NIGHT_SLOT, LATER_SLOT]);

    // Um minuto depois, o slot das 21h (Sao Paulo) passa sem novo fetch.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.slots).toEqual([LATER_SLOT]);
    expect(result.current.slotsByDate['2026-09-10']).toEqual([LATER_SLOT]);
    expect(mocks.getAvailability).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(60 * 60_000);
    });

    expect(result.current.slots).toEqual([]);
    expect(result.current.slotsByDate).toEqual({});
  });
});
