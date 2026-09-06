'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { apiClient, ApiError } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import type { MonthlyLessonsPlan } from '@/schemas/checkout.schema';

/**
 * Linha crua devolvida por GET /api/v1/subscriptions.
 *
 * O endpoint responde o registro do Prisma sem projecao (ver
 * `src/app/api/v1/subscriptions/route.ts`), entao este formato acompanha o
 * `model Subscription` do schema: nao existe coluna `cancelAtPeriodEnd`, o
 * cancelamento agendado e sinalizado por `cancelledAt`.
 */
interface SubscriptionApiRow {
  id: string;
  status: string;
  weeklyFrequency: number;
  monthlyLessons: number | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  stripeSubscriptionId: string;
}

export interface Subscription {
  id: string;
  status: string;
  /** Cadencia semanal legada (1..5). Sempre preenchida (coluna NOT NULL). */
  weeklyFrequency: number;
  /**
   * Eixo canonico: volume mensal contratado (10 ou 20). `null` = assinatura
   * legada, precificada e creditada pela cadencia semanal.
   */
  monthlyLessons: number | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  /** Momento em que o cancelamento ao fim do periodo foi agendado. */
  cancelledAt: string | null;
  /**
   * DERIVADO de `cancelledAt` — a API nao expoe esse campo.
   * `POST /api/v1/subscriptions/cancel` agenda o cancelamento no Stripe
   * (`cancel_at_period_end`) e grava `cancelledAt` mantendo o status ACTIVE ate
   * o webhook encerrar o ciclo. Portanto `cancelledAt != null` significa
   * exatamente "sera encerrada ao fim do periodo atual".
   */
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string;
}

/**
 * Corpo aceito por POST /api/v1/subscriptions/update (ver
 * `src/app/api/v1/subscriptions/update/route.ts`): EXATAMENTE um eixo por
 * requisicao. `prorationDate` acompanha o preview quando existe.
 */
export interface SubscriptionUpdatePayload {
  monthlyLessons?: MonthlyLessonsPlan;
  weeklyFrequency?: number;
  prorationDate?: number;
}

interface UpdatePlanOptions {
  /** Reaproveitar a chave permite reenviar a mesma mudanca sem cobrar duas vezes. */
  idempotencyKey?: string;
}

interface UseSubscriptionReturn {
  subscription: Subscription | null;
  isLoading: boolean;
  error: string | null;
  isCancelling: boolean;
  isUpdating: boolean;
  refetch: () => Promise<void>;
  cancel: () => Promise<void>;
  updatePlan: (
    payload: SubscriptionUpdatePayload,
    options?: UpdatePlanOptions,
  ) => Promise<void>;
}

/**
 * Traducao obrigatoria: chave ausente e DEFEITO, nao texto opcional.
 * Em desenvolvimento estoura no primeiro uso; em producao devolve string vazia
 * — a chave crua NUNCA aparece para o usuario final.
 *
 * DUPLICADO em `src/components/billing/subscription-manager.tsx` e nos demais
 * arquivos deste work package: extrair para um modulo compartilhado sairia da
 * lista de arquivos de propriedade.
 */
function missingMessage(fullKey: string): string {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`[i18n] chave de traducao ausente: ${fullKey}`);
  }
  return '';
}

function buildIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `subscription-change-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSubscription(row: SubscriptionApiRow | null): Subscription | null {
  if (!row) return null;

  const cancelledAt = row.cancelledAt ?? null;
  return {
    id: row.id,
    status: row.status,
    weeklyFrequency: row.weeklyFrequency,
    monthlyLessons: row.monthlyLessons ?? null,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelledAt,
    cancelAtPeriodEnd: cancelledAt !== null,
    stripeSubscriptionId: row.stripeSubscriptionId,
  };
}

/**
 * Assinatura ativa do aluno, nos DOIS eixos de plano.
 *
 * Toda escrita passa por aqui (cancelamento e troca de plano) para que o toast,
 * o estado de carregamento e o refetch existam uma unica vez — a pagina de
 * troca de plano nao fala com o endpoint por conta propria.
 */
export function useSubscription(): UseSubscriptionReturn {
  const t = useTranslations('credits.subscription');
  const text = (key: string): string =>
    t.has(key) ? t(key) : missingMessage(`credits.subscription.${key}`);

  /**
   * Os callbacks abaixo sao estaveis de proposito (o efeito de carga depende de
   * `refetch`). Guardar o tradutor num ref mantem as mensagens do locale atual
   * sem recriar os callbacks nem arriscar um loop de fetch caso a identidade de
   * `t` mude entre renders.
   */
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  });

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await apiClient.get<{ data: SubscriptionApiRow | null }>(
        API.SUBSCRIPTIONS,
      );
      setSubscription(normalizeSubscription(json.data ?? null));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : textRef.current('loadError');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const cancel = useCallback(async () => {
    setIsCancelling(true);
    try {
      await apiClient.post(API.SUBSCRIPTIONS_CANCEL, {});
      toast.success(textRef.current('cancelSuccess'));
      await refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : textRef.current('cancelError'));
      throw err;
    } finally {
      setIsCancelling(false);
    }
  }, [refetch]);

  const updatePlan = useCallback(
    async (payload: SubscriptionUpdatePayload, options?: UpdatePlanOptions) => {
      const hasMonthly = payload.monthlyLessons !== undefined;
      const hasWeekly = payload.weeklyFrequency !== undefined;

      // Mesmo XOR do schema do endpoint. Barrar aqui troca um 400 opaco por uma
      // mensagem traduzida, sem gastar a chave de idempotencia.
      if (hasMonthly === hasWeekly) {
        const message = textRef.current('axisError');
        toast.error(message);
        throw new ApiError(message, 400, 'SUBSCRIPTION_AXIS_INVALID');
      }

      setIsUpdating(true);
      try {
        await apiClient.post(API.SUBSCRIPTIONS_UPDATE, payload, {
          headers: {
            'Idempotency-Key': options?.idempotencyKey ?? buildIdempotencyKey(),
          },
        });
        toast.success(textRef.current('updateSuccess'));
        await refetch();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : textRef.current('updateError'));
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },
    [refetch],
  );

  return {
    subscription,
    isLoading,
    error,
    isCancelling,
    isUpdating,
    refetch,
    cancel,
    updatePlan,
  };
}
