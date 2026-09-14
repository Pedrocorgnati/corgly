import { renderHook } from '@/test/utils';
import { describe, expect, it, vi } from 'vitest';
import { useTimezone } from '@/hooks/useTimezone';

describe('useTimezone', () => {
  it('deriva a formatacao somente dos fusos recebidos, sem buscar rota administrativa', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(() =>
      useTimezone('America/Sao_Paulo', 'Europe/Rome'),
    );

    expect(result.current.studentTz).toBe('America/Sao_Paulo');
    expect(result.current.adminTz).toBe('Europe/Rome');
    expect(result.current.formatDualTz(new Date('2026-09-11T00:00:00.000Z')))
      .toEqual(expect.any(String));
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
