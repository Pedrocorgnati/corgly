'use client';

import { useCallback, useEffect, useState } from 'react';

export type MetricPeriod = '7d' | '30d' | '90d';
export type MetricType = 'financials' | 'engagement' | 'users';

interface State<T> {
  data:    T | null;
  loading: boolean;
  error:   string | null;
}

export function useAdminMetrics<T = unknown>(type: MetricType, period: MetricPeriod, refreshKey = 0) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });

  const fetcher = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/v1/admin/metrics/${type}?period=${period}`, {
        credentials: 'include',
        cache:       'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setState({ data: json.data as T, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: err instanceof Error ? err.message : 'Erro' });
    }
  }, [type, period]);

  useEffect(() => {
    fetcher();
  }, [fetcher, refreshKey]);

  return { ...state, refetch: fetcher };
}
