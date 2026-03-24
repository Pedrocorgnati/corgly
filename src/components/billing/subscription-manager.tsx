'use client';

import { useState } from 'react';
import { CalendarClock, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { ROUTES } from '@/lib/constants/routes';
import { SubscriptionStatus } from '@/lib/constants/enums';
import { useSubscription } from '@/hooks/useSubscription';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ACTIVE: { label: 'Ativa', variant: 'default' },
  CANCELLED: { label: 'Cancelada', variant: 'destructive' },
  PAST_DUE: { label: 'Pagamento pendente', variant: 'secondary' },
  INCOMPLETE: { label: 'Incompleta', variant: 'outline' },
};

const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5] as const;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function calculateMonthlyPrice(freq: number) {
  return Math.ceil(freq * 16 * 4.33);
}

export function SubscriptionManager() {
  const { subscription, isLoading, error, isCancelling, isUpdating, refetch, cancel, updateFrequency } = useSubscription();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [newFrequency, setNewFrequency] = useState<number>(2);

  const handleCancel = async () => {
    try {
      await cancel();
      setShowCancelModal(false);
    } catch {
      // error toast handled inside hook
    }
  };

  const handleUpdate = async () => {
    try {
      await updateFrequency(newFrequency);
      setShowUpdateModal(false);
    } catch {
      // error toast handled inside hook
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={refetch} />;
  }

  if (!subscription) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Sem assinatura ativa"
        description="Assine um plano mensal para aulas recorrentes com desconto."
        actionLabel="Ver planos"
        actionHref={ROUTES.CREDITS}
      />
    );
  }

  const status = STATUS_LABELS[subscription.status] ?? {
    label: subscription.status,
    variant: 'secondary' as const,
  };
  const monthlyPrice = calculateMonthlyPrice(subscription.weeklyFrequency);
  const isActive = subscription.status === SubscriptionStatus.ACTIVE && !subscription.cancelAtPeriodEnd;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Plano Mensal — {subscription.weeklyFrequency}x por semana
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              ${monthlyPrice}/mês
            </p>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Período atual</p>
            <p className="text-foreground font-medium">
              {formatDate(subscription.currentPeriodStart)} — {formatDate(subscription.currentPeriodEnd)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Frequência</p>
            <p className="text-foreground font-medium">
              {subscription.weeklyFrequency} aula{subscription.weeklyFrequency > 1 ? 's' : ''} por semana
            </p>
          </div>
        </div>

        {subscription.cancelAtPeriodEnd && (
          <div className="mt-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            Sua assinatura será encerrada em {formatDate(subscription.currentPeriodEnd)}.
          </div>
        )}
      </div>

      {isActive && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Update frequency */}
          <div className="flex items-center gap-2 flex-1">
            <label htmlFor="frequency-select" className="text-sm text-muted-foreground whitespace-nowrap">
              Alterar frequência:
            </label>
            <select
              id="frequency-select"
              value={newFrequency}
              onChange={(e) => setNewFrequency(Number(e.target.value))}
              className="h-[44px] rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              aria-label="Frequência semanal"
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}x/semana — ${calculateMonthlyPrice(f)}/mês
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px]"
              onClick={() => setShowUpdateModal(true)}
              disabled={newFrequency === subscription.weeklyFrequency}
            >
              Confirmar alteração
            </Button>
          </div>

          {/* Cancel */}
          <Button
            variant="destructive"
            size="sm"
            className="min-h-[44px]"
            onClick={() => setShowCancelModal(true)}
          >
            Cancelar assinatura
          </Button>
        </div>
      )}

      {/* Cancel confirmation modal */}
      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancel}
        title="Cancelar assinatura"
        message={`Sua assinatura será cancelada ao final do período atual (${formatDate(subscription.currentPeriodEnd)}). Seus créditos restantes permanecem válidos até a data de expiração.`}
        confirmText="Cancelar assinatura"
        cancelText="Manter assinatura"
        dangerLevel="high"
        isLoading={isCancelling}
      />

      {/* Update confirmation modal */}
      <ConfirmModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        onConfirm={handleUpdate}
        title="Alterar frequência"
        message={`Alterar de ${subscription.weeklyFrequency}x para ${newFrequency}x por semana. Novo valor: $${calculateMonthlyPrice(newFrequency)}/mês. A cobrança será proporcional.`}
        confirmText="Confirmar alteração"
        cancelText="Cancelar"
        dangerLevel="low"
        isLoading={isUpdating}
      />
    </div>
  );
}
