import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDebounce } from '@/hooks/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna o valor inicial imediatamente', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));
    expect(result.current).toBe('initial');
  });

  it('não atualiza valor antes do delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });
    vi.advanceTimersByTime(200);

    expect(result.current).toBe('initial');
  });

  it('atualiza valor após o delay completo', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('updated');
  });

  it('redefine o timer a cada nova mudança (cancela mudanças intermediárias)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    vi.advanceTimersByTime(200);
    rerender({ value: 'c' });
    vi.advanceTimersByTime(200);

    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe('c');
  });

  it('funciona com delay customizado', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 1000), {
      initialProps: { value: 'x' },
    });

    rerender({ value: 'y' });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe('x');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('y');
  });
});
