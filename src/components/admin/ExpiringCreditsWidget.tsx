'use client';
import { API } from '@/lib/constants/routes';

import { useState } from 'react';
import { CreditCard, AlertTriangle, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import type { AdminDashboardData } from '@/actions/admin-dashboard';
import { apiClient, ApiError } from '@/lib/api-client';

interface ExpiringCreditsWidgetProps {
  expiringCredits: AdminDashboardData['expiringCredits'];
}

function daysColor(days: number | null): string {
  if (days === null) return 'text-muted-foreground';
  if (days <= 2) return 'text-destructive';
  if (days <= 5) return 'text-warning';
  return 'text-muted-foreground';
}

function daysBg(days: number | null): string {
  if (days === null) return 'bg-muted';
  if (days <= 2) return 'bg-destructive/10';
  if (days <= 5) return 'bg-warning/10';
  return 'bg-muted';
}

function daysLabel(days: number | null): string {
  if (days === null) return 'sem data';
  if (days <= 0) return 'hoje';
  if (days === 1) return '1 dia';
  return `${days} dias`;
}

export function ExpiringCreditsWidget({ expiringCredits }: ExpiringCreditsWidgetProps) {
  const { count, items } = expiringCredits;
  const [notifying, setNotifying] = useState<Record<string, boolean>>({});

  async function handleNotify(userId: string, studentName: string) {
    setNotifying((prev) => ({ ...prev, [userId]: true }));
    try {
      await apiClient.post(API.ADMIN.CREDITS_NOTIFY_EXPIRING, { userId });
      toast.success(`E-mail enviado para ${studentName}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao enviar notificação.');
    } finally {
      setNotifying((prev) => ({ ...prev, [userId]: false }));
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h2 className="font-semibold text-foreground">Créditos Expirando</h2>
        </div>
        {count > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
            {count}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum crédito expirando"
          description="Nenhum lote de créditos vence nos próximos 7 dias."
          className="py-6"
        />
      ) : (
        <ul className="space-y-3" role="list">
          {items.slice(0, 5).map((item) => (
            <li
              key={item.batchId}
              className="flex items-center justify-between rounded-lg border border-border p-3 gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {item.student.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.remaining} {item.remaining === 1 ? 'crédito restante' : 'créditos restantes'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    daysColor(item.daysUntilExpiry),
                    daysBg(item.daysUntilExpiry),
                  )}
                >
                  {daysLabel(item.daysUntilExpiry)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={notifying[item.userId]}
                  onClick={() => handleNotify(item.userId, item.student.name)}
                  aria-label={`Notificar ${item.student.name}`}
                >
                  <Bell className="h-3.5 w-3.5 mr-1" />
                  {notifying[item.userId] ? 'Enviando…' : 'Notificar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
