'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiClient, ApiError } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';

export interface Subscription {
  id: string;
  status: string;
  weeklyFrequency: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string;
}

interface UseSubscriptionReturn {
  subscription: Subscription | null;
  isLoading: boolean;
  error: string | null;
  isCancelling: boolean;
  isUpdating: boolean;
  refetch: () => Promise<void>;
  cancel: () => Promise<void>;
  updateFrequency: (newFrequency: number) => Promise<void>;
}

export function useSubscription(): UseSubscriptionReturn {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await apiClient.get<{ data: Subscription }>(API.SUBSCRIPTIONS);
      setSubscription(json.data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao carregar assinatura';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const cancel = useCallback(async () => {
    setIsCancelling(true);
    try {
      await apiClient.post(API.SUBSCRIPTIONS_CANCEL, {});
      toast.success(
        `Assinatura cancelada. Válida até o final do período atual.`,
      );
      await refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao cancelar. Tente novamente.');
      throw err;
    } finally {
      setIsCancelling(false);
    }
  }, [refetch]);

  const updateFrequency = useCallback(async (newFrequency: number) => {
    setIsUpdating(true);
    try {
      await apiClient.post(API.SUBSCRIPTIONS_UPDATE, { weeklyFrequency: newFrequency });
      toast.success('Frequência atualizada com sucesso.');
      await refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao atualizar. Tente novamente.');
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }, [refetch]);

  return { subscription, isLoading, error, isCancelling, isUpdating, refetch, cancel, updateFrequency };
}
