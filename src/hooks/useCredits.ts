'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';

// ── Types ──

interface CreditBatch {
  id: string;
  quantity: number;
  remaining: number;
  expiresAt: string;
}

interface CreditsApiResponse {
  balance: number;
  breakdown: CreditBatch[];
}

export interface UseCreditsReturn {
  balance: number;
  breakdown: CreditBatch[];
  expiringSoon: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ── Constants ──

const POLL_INTERVAL_MS = 60_000;
const EXPIRY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Hook ──

export function useCredits(): UseCreditsReturn {
  const [balance, setBalance] = useState(0);
  const [breakdown, setBreakdown] = useState<CreditBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastValidBalance = useRef(0);

  const fetchCredits = useCallback(async () => {
    try {
      const data = await apiClient.get<CreditsApiResponse>(API.CREDITS);
      setBalance(data.balance);
      setBreakdown(data.breakdown);
      setError(null);
      lastValidBalance.current = data.balance;
    } catch (err) {
      // Keep last valid balance on error
      setBalance(lastValidBalance.current);
      setError(err instanceof Error ? err.message : 'Erro ao buscar créditos');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();

    const interval = setInterval(fetchCredits, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchCredits]);

  const expiringSoon = breakdown.some((batch) => {
    const expiresAt = new Date(batch.expiresAt).getTime();
    const threshold = Date.now() + EXPIRY_THRESHOLD_MS;
    return batch.remaining > 0 && expiresAt < threshold;
  });

  return { balance, breakdown, expiringSoon, isLoading, error, refetch: fetchCredits };
}
