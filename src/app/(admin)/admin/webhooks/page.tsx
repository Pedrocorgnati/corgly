'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageWrapper } from '@/components/shared';
import { API } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';

type WebhookStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'IGNORED';

interface StripeWebhookEventItem {
  id: string;
  eventId: string;
  type: string;
  status: WebhookStatus;
  errorMessage: string | null;
  processedAt: string | null;
  lastReplayAt: string | null;
  replayCount: number;
  createdAt: string;
  updatedAt: string;
}

interface StripeWebhookListResponse {
  items: StripeWebhookEventItem[];
  total: number;
}

interface StripeWebhookReplayResponse {
  event: StripeWebhookEventItem;
  idempotentReplay: boolean;
}

interface ApiEnvelope<T> {
  data: T;
  error: string | null;
  message: string | null;
}

const FILTERS: Array<{ value: 'all' | WebhookStatus; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'FAILED', label: 'Falhas' },
  { value: 'PROCESSING', label: 'Processando' },
  { value: 'PROCESSED', label: 'Processados' },
  { value: 'IGNORED', label: 'Ignorados' },
];

function formatError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Erro ao processar webhook Stripe.';
}

function statusColor(status: WebhookStatus): string {
  if (status === 'FAILED') return 'text-destructive bg-destructive/10 border-destructive/30';
  if (status === 'PROCESSED') return 'text-success bg-success/10 border-success/25';
  if (status === 'PROCESSING') return 'text-amber-600 bg-amber-100 border-amber-300';
  return 'text-muted-foreground bg-muted border-border';
}

export default function AdminStripeWebhooksPage() {
  const [items, setItems] = useState<StripeWebhookEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | WebhookStatus>('all');
  const [busyByEventId, setBusyByEventId] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item.status === filter);
  }, [filter, items]);

  const load = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<ApiEnvelope<StripeWebhookListResponse>>(
        API.ADMIN.STRIPE_WEBHOOKS,
      );
      setItems(response.data.items);
    } catch (error) {
      toast.error(formatError(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, []);

  const replay = async (event: StripeWebhookEventItem) => {
    setBusyByEventId((state) => ({ ...state, [event.eventId]: true }));

    try {
      const response = await apiClient.post<ApiEnvelope<StripeWebhookReplayResponse>>(
        API.ADMIN.STRIPE_WEBHOOKS,
        { eventId: event.eventId },
      );
      const updated = response.data.event;
      setItems((state) =>
        state.map((current) => (current.eventId === updated.eventId ? updated : current)),
      );
      toast.success(response.data.idempotentReplay ? 'Evento já processado.' : 'Replay executado.');
    } catch (error) {
      toast.error(formatError(error));
    } finally {
      setBusyByEventId((state) => ({ ...state, [event.eventId]: false }));
    }
  };

  return (
    <PageWrapper data-testid="page-admin-webhooks">
      <div data-testid="admin-webhooks-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Webhooks Stripe</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Eventos recebidos, falhas de processamento e replay administrativo seguro.
        </p>
      </div>

      <div data-testid="admin-webhooks-filters" className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((option) => (
          <Button
            key={option.value}
            data-testid={`admin-webhooks-filter-${option.value.toLowerCase()}-button`}
            size="sm"
            variant={filter === option.value ? 'default' : 'outline'}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {loading && <p data-testid="admin-webhooks-loading" className="text-sm text-muted-foreground">Carregando webhooks...</p>}

      {!loading && filteredItems.length === 0 && (
        <div data-testid="admin-webhooks-empty" className="border border-dashed border-border rounded-xl p-8 text-sm text-muted-foreground text-center bg-card">
          Nenhum evento encontrado para o filtro atual.
        </div>
      )}

      <div data-testid="admin-webhooks-list" className="space-y-4">
        {filteredItems.map((item) => {
          const busy = busyByEventId[item.eventId] === true;
          const canReplay = item.status === 'FAILED' || item.status === 'RECEIVED';

          return (
            <div key={item.eventId} data-testid={`admin-webhooks-card-${item.eventId}`} className="bg-card border border-border rounded-xl p-4 sm:p-5">
              <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
                <div>
                  <p className="font-semibold text-sm text-foreground">{item.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.eventId} · atualizado em {new Date(item.updatedAt).toLocaleString('pt-BR')}
                  </p>
                </div>

                <Badge className={statusColor(item.status)}>{item.status}</Badge>
              </div>

              {item.errorMessage && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-3">
                  {item.errorMessage}
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-3 text-xs text-muted-foreground mb-4">
                <span>Processado: {item.processedAt ? new Date(item.processedAt).toLocaleString('pt-BR') : '-'}</span>
                <span>Ultimo replay: {item.lastReplayAt ? new Date(item.lastReplayAt).toLocaleString('pt-BR') : '-'}</span>
                <span>Replays: {item.replayCount}</span>
              </div>

              <div className="flex justify-end">
                <Button
                  data-testid={`admin-webhooks-replay-button-${item.eventId}`}
                  disabled={!canReplay || busy || isPending}
                  onClick={() => replay(item)}
                  size="sm"
                  variant={canReplay ? 'default' : 'outline'}
                >
                  <RotateCcw className="size-4" />
                  Replay
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </PageWrapper>
  );
}
