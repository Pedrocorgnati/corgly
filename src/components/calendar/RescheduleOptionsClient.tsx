'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
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

/**
 * Ate 2026-09-07 este mapa guardava a copy pronta em portugues — fora do alcance
 * do next-intl. Agora guarda so o PREFIXO da chave: o `ErrorKind` continua sendo
 * o discriminante que vem do servidor, e o texto sai do dicionario no idioma do
 * leitor.
 */
const ERROR_KEY: Record<ErrorKind, string> = {
  forbidden: 'forbidden',
  not_found: 'notFound',
  invalid_status: 'invalidStatus',
  server: 'server',
};

export function RescheduleOptionsClient(props: RescheduleOptionsClientProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo aluno.
  const t = useTranslations('calendar.rescheduleOptions');
  const locale = useLocale();
  const router = useRouter();
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (props.state === 'error') {
    const prefixo = ERROR_KEY[props.errorKind];
    return (
      <div
        data-testid="schedule-reschedule-error"
        role="alert"
        className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-12 text-center"
      >
        <XCircle className="mb-4 h-10 w-10 text-destructive" />
        <p className="font-medium text-foreground">{t(`${prefixo}Title`)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t(`${prefixo}Desc`)}</p>
        <Button data-testid="schedule-reschedule-back-button" variant="outline" className="mt-6" onClick={() => router.push(ROUTES.HISTORY)}>
          {t('backHistory')}
        </Button>
      </div>
    );
  }

  const { data } = props;
  const { session, student_timezone, policy_window, penalty, options } = data;
  const requiresApproval = penalty.requires_approval;

  const formatSlot = (iso: string) =>
    formatDatetime(new Date(iso), student_timezone, 'short', locale);

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
      toast.success(requiresApproval ? t('requestToast') : t('doneToast'));
      router.push(ROUTES.HISTORY);
      router.refresh();
    } catch {
      toast.error(t('errorToast'));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          {t('originalSession')}{' '}
          <span className="text-foreground">{formatSlot(session.start_at)}</span>
        </p>
      </div>

      {requiresApproval ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-amber-700">
            {t('approvalTitle')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{penalty.reason}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
          <p className="text-sm font-medium text-emerald-700">
            {t('freeWindow', { hours: policy_window.free_window_hours })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('freeWindowDesc')}
          </p>
        </div>
      )}

      {options.length === 0 ? (
        <div data-testid="schedule-reschedule-empty" className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <CalendarX2 className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">{t('emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('emptyDesc')}
          </p>
        </div>
      ) : (
        <fieldset data-testid="schedule-reschedule-options" className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-foreground">
            {t('legend')}
          </legend>
          {options.map((slot) => {
            const selected = selectedSlotId === slot.availability_slot_id;
            return (
              <label
                key={slot.availability_slot_id}
                data-testid={`schedule-reschedule-slot-${slot.availability_slot_id}`}
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
          data-testid="schedule-reschedule-cancel-button"
          variant="outline"
          className="flex-1"
          onClick={() => router.push(ROUTES.HISTORY)}
          disabled={submitting}
        >
          {t('cancel')}
        </Button>
        <Button
          data-testid="schedule-reschedule-confirm-button"
          className="flex-1"
          onClick={handleConfirm}
          disabled={!selectedSlotId || submitting || options.length === 0}
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('rescheduling')}
            </span>
          ) : requiresApproval ? (
            t('requestSubmit')
          ) : (
            t('confirmSubmit')
          )}
        </Button>
      </div>

      {!submitting && selectedSlotId && !requiresApproval && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          {t('immediateHint')}
        </p>
      )}
    </div>
  );
}
