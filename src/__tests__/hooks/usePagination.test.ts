import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { usePagination } from '@/hooks/usePagination';

describe('usePagination', () => {
  it('calcula totalPages corretamente', () => {
    const { result } = renderHook(() => usePagination({ total: 100, page: 1, limit: 10 }));
    expect(result.current.totalPages).toBe(10);
  });

  it('totalPages é 1 com 0 itens', () => {
    const { result } = renderHook(() => usePagination({ total: 0, page: 1, limit: 10 }));
    expect(result.current.totalPages).toBe(1);
  });

  it('hasPrev é false na primeira página', () => {
    const { result } = renderHook(() => usePagination({ total: 50, page: 1, limit: 10 }));
    expect(result.current.hasPrev).toBe(false);
  });

  it('hasPrev é true em página > 1', () => {
    const { result } = renderHook(() => usePagination({ total: 50, page: 2, limit: 10 }));
    expect(result.current.hasPrev).toBe(true);
  });

  it('hasNext é false na última página', () => {
    const { result } = renderHook(() => usePagination({ total: 50, page: 5, limit: 10 }));
    expect(result.current.hasNext).toBe(false);
  });

  it('hasNext é true quando há mais páginas', () => {
    const { result } = renderHook(() => usePagination({ total: 50, page: 3, limit: 10 }));
    expect(result.current.hasNext).toBe(true);
  });

  it('calcula from e to corretamente no meio', () => {
    const { result } = renderHook(() => usePagination({ total: 100, page: 3, limit: 10 }));
    expect(result.current.from).toBe(21);
    expect(result.current.to).toBe(30);
  });

  it('to não ultrapassa o total na última página parcial', () => {
    const { result } = renderHook(() => usePagination({ total: 95, page: 10, limit: 10 }));
    expect(result.current.to).toBe(95);
  });

  it('from e to são 0 quando total é 0', () => {
    const { result } = renderHook(() => usePagination({ total: 0, page: 1, limit: 10 }));
    expect(result.current.from).toBe(0);
    expect(result.current.to).toBe(0);
  });
});
