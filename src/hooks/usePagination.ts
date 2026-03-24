'use client';

import { useMemo } from 'react';

export interface UsePaginationParams {
  total: number;
  page: number;
  limit: number;
}

export interface UsePaginationReturn {
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  from: number;
  to: number;
}

/**
 * Calcula dados de paginação a partir de total, página e limit.
 *
 * @param total  - Total de itens
 * @param page   - Página atual (1-indexed)
 * @param limit  - Itens por página
 */
export function usePagination({ total, page, limit }: UsePaginationParams): UsePaginationReturn {
  return useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const from = total === 0 ? 0 : (safePage - 1) * limit + 1;
    const to = Math.min(safePage * limit, total);

    return {
      totalPages,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
      from,
      to,
    };
  }, [total, page, limit]);
}
