'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle, CalendarX2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { rescheduleSession } from '@/actions/sessions';
import { formatDatetime } from '@/lib/format-datetime';
import { ROUTES } from '@/lib/constants/routes';
import type { RescheduleOptionsResult } from '@/lib/bookings/reschedule-options.service';

type ErrorKind = 'forbidden' | 'not_found' | 'invalid_status' | 'server';

export type RescheduleOptionsClientProps =
  | { state: 'ok'; data: RescheduleOptionsResult }
  | { state: 'error'; errorKind: ErrorKind };

const ERROR_COPY: Record<ErrorKind, { title: string; description: string }> = {
  forbidden: {
    title: 'Acesso negado',
    description: 'Esta sessão não pertence à sua conta.',
  },
  not_found: {
    title: 'Sessão não encontrada',
    description: 'Não localizamos a sessão que você quer reagendar.',
  },
  invalid_status: {
    title: 'Reagendamento indisponível',
    description: 'Só é possível reagendar sessões agendadas e ainda não realizadas.',
  },
  server: {
    title: 'Erro ao carregar opções',
    description: 'Algo deu errado ao buscar as alternativas. Tente novamente em instantes.',
  },
};

export function RescheduleOptionsClient(props: RescheduleOptionsClientProps) {
  const router = useRouter();
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (props.state === 'error') {
    const copy = ERROR_COPY[props.errorKind];
    return (
      <div
        role="alert"
        className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-12 text-center"
      >
        <XCircle className="mb-4 h-10 w-10 text-destructive" />
        <p className="font-medium text-foreground">{copy.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
        <Button variant="outline" className="mt-6" onClick={() => router.push(ROUTES.HISTORY)}>
          Voltar ao histórico
        </Button>
      </div>
    );
  }

  const { data } = props;
  const { session, student_timezone, policy_window, penalty, options } = data;
  const requiresApproval = penalty.requires_approval;

  const formatSlot = (iso: string) =>
    formatDatetime(new Date(iso), student_timezone, 'short', 'pt-BR');

  const handleConfirm = async () => {
    if (!selectedSlotId) return;
    setSubmitting(true);
    try {
      const result = await rescheduleSession(session.id, selectedSlotId);
      if (result.error) {
        toast.error(result.error);
        setSubmitting(false);
        return;
      }
      toast.success(
        requiresApproval
          ? 'Pedido de reagendamento enviado para aprovação do professor.'
          : 'Sessão reagendada com sucesso!',
      );
      router.push(ROUTES.HISTORY);
      router.refresh();
    } catch {
      toast.error('Erro ao reagendar. Tente novamente.');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Sessão original: <span className="text-foreground">{formatSlot(session.start_at)}</span>
        </p>
      </div>

      {requiresApproval ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-amber-700">
            Seu pedido será enviado para aprovação do professor
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{penalty.reason}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
          <p className="text-sm font-medium text-emerald-700">
            Reagendamento gratuito dentro da janela de {policy_window.free_window_hours}h
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Confirme uma das alternativas abaixo para trocar o horário imediatamente.
          </p>
        </div>
      )}

      {options.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <CalendarX2 className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">Sem horários alternativos no momento</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Não há slots livres nos próximos dias. Tente novamente mais tarde.
          </p>
        </div>
      ) : (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-foreground">
            Escolha um novo horário
          </legend>
          {options.map((slot) => {
            const selected = selectedSlotId === slot.availability_slot_id;
            return (
              <label
                key={slot.availability_slot_id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <input
                  type="radio"
                  name="reschedule-slot"
                  value={slot.availability_slot_id}
                  checked={selected}
                  onChange={() => setSelectedSlotId(slot.availability_slot_id)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm text-foreground">{formatSlot(slot.start_at)}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => router.push(ROUTES.HISTORY)}
          disabled={submitting}
        >
          Cancelar
        </Button>
        <Button
          className="flex-1"
          onClick={handleConfirm}
          disabled={!selectedSlotId || submitting || options.length === 0}
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reagendando...
            </span>
          ) : requiresApproval ? (
            'Solicitar reagendamento'
          ) : (
            'Confirmar reagendamento'
          )}
        </Button>
      </div>

      {!submitting && selectedSlotId && !requiresApproval && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Confirmação imediata, sem aprovação necessária.
        </p>
      )}
    </div>
  );
}
