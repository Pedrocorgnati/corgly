'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cancelSession } from '@/actions/sessions';
import { toast } from 'sonner';

const LATE_CANCEL_HOURS = 12;

interface CancelConfirmDialogProps {
  session: { id: string; startAt: string; status: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}

export function CancelConfirmDialog({
  session,
  open,
  onOpenChange,
  onCancelled,
}: CancelConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const hoursUntilSession =
    (new Date(session.startAt).getTime() - Date.now()) / (1000 * 60 * 60);
  const isLateCancellation = hoursUntilSession < LATE_CANCEL_HOURS;

  const handleCancel = () => {
    startTransition(async () => {
      try {
        const result = await cancelSession(session.id, reason || undefined);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success('Sessão cancelada com sucesso.');
        onCancelled();
      } catch {
        toast.error('Erro ao cancelar sessão. Tente novamente.');
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar cancelamento"
    >
      <div className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Confirmar cancelamento
        </h3>

        {isLateCancellation ? (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4">
            <p className="text-sm text-destructive font-medium">
              Cancelamento tardio — crédito não será reembolsado
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              A sessão começa em menos de {LATE_CANCEL_HOURS} horas.
            </p>
          </div>
        ) : (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-4">
            <p className="text-sm text-emerald-700 font-medium">
              Seu crédito será reembolsado
            </p>
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="cancel-reason" className="text-sm font-medium text-foreground block mb-1">
            Motivo (opcional)
          </label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Informe o motivo do cancelamento..."
            className="min-h-[80px] resize-none"
          />
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="flex-1"
          >
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={isPending}
            className="flex-1"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Cancelando...
              </>
            ) : (
              'Confirmar cancelamento'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
