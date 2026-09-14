'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader2, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { CalendarView } from '@/components/calendar/CalendarView';
import { SlotPicker } from '@/components/calendar/SlotPicker';
import { useCalendar } from '@/hooks/useCalendar';
import { useTimezone } from '@/hooks/useTimezone';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { rescheduleSession } from '@/actions/sessions';
import { ROUTES } from '@/lib/constants/routes';
import { toast } from 'sonner';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

const LATE_RESCHEDULE_HOURS = 12;

type FlowState = 'selecting' | 'confirming' | 'success' | 'error';

interface RescheduleFlowProps {
  session: { id: string; startAt: string };
  studentTimezone: string;
  adminTimezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRescheduled: () => void;
}

export function RescheduleFlow({
  session,
  studentTimezone,
  adminTimezone,
  open,
  onOpenChange,
  onRescheduled,
}: RescheduleFlowProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo aluno.
  const t = useTranslations('calendar.reschedule');
  const {
    currentMonth,
    currentYear,
    slotsByDate,
    isLoading,
    error: loadError,
    prevMonth,
    nextMonth,
    refresh,
  } = useCalendar({ timeZone: studentTimezone });
  const { studentTz, adminTz } = useTimezone(studentTimezone, adminTimezone);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [flowState, setFlowState] = useState<FlowState>('selecting');
  const [errorMessage, setErrorMessage] = useState('');

  const handleClose = () => {
    setFlowState('selecting');
    setSelectedDate(null);
    setSelectedSlot(null);
    setErrorMessage('');
    onOpenChange(false);
  };

  const handleSuccessClose = () => {
    handleClose();
    onRescheduled();
  };

  // Esc e clique no fundo reaproveitam o handler do controle de fechar que cada
  // estado mostra. `selecting` fecha pelo cancelar, que continua montado com
  // `loadError`. `success` usa `handleSuccessClose` para nao pular o
  // `onRescheduled`. `confirming` nao mostra controle de fechar e fica inerte com
  // o `rescheduleSession` em voo.
  const dismissByState: Record<FlowState, (() => void) | null> = {
    selecting: handleClose,
    confirming: null,
    success: handleSuccessClose,
    error: handleClose,
  };

  const { dialogRef, handleBackdropClick } = useDialogA11y<HTMLDivElement>({
    open,
    onDismiss: dismissByState[flowState],
    // O bloco de erro de carregamento troca os botoes do painel sem mudar o estado.
    focusKey: `${flowState}:${loadError ? 'load-error' : 'loaded'}`,
  });

  if (!open) return null;

  const hoursUntilSession =
    (new Date(session.startAt).getTime() - Date.now()) / (1000 * 60 * 60);
  const isLateReschedule = hoursUntilSession < LATE_RESCHEDULE_HOURS;

  const slotsForDate = selectedDate ? (slotsByDate[selectedDate] ?? []) : [];
  // A selecao so vale enquanto o slot continua na lista: quando o horario vence
  // e o `useCalendar` o remove, o confirmar volta a ficar desabilitado.
  const activeSlot =
    selectedSlot && slotsForDate.some((slot) => slot.id === selectedSlot.id)
      ? selectedSlot
      : null;

  const isPastSlot = (slot: AvailabilitySlot) =>
    new Date(slot.startAt).getTime() <= Date.now();

  const handleSelectSlot = (slot: AvailabilitySlot) => {
    // Aba em segundo plano atrasa o timer do hook; o clique revalida o instante.
    if (isPastSlot(slot)) {
      setSelectedSlot(null);
      refresh();
      return;
    }
    setSelectedSlot((prev) => (prev?.id === slot.id ? null : slot));
  };

  const handleSelectDate = (date: string | null) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleConfirm = async () => {
    if (!activeSlot) return;
    if (isPastSlot(activeSlot)) {
      setSelectedSlot(null);
      refresh();
      return;
    }
    setFlowState('confirming');
    try {
      const result = await rescheduleSession(session.id, activeSlot.id);
      if (result.error) {
        setErrorMessage(result.error);
        setFlowState('error');
        return;
      }
      setFlowState('success');
      if (isLateReschedule) {
        toast.success(t('requestToast'));
      } else {
        toast.success(t('doneToast'));
      }
    } catch {
      setErrorMessage(t('genericError'));
      setFlowState('error');
    }
  };

  return (
    <div
      ref={dialogRef}
      data-testid="modal-reschedule"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={t('dialogLabel')}
      tabIndex={-1}
      onClick={handleBackdropClick}
    >
      <div className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-3xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {flowState === 'selecting' && (
          <>
            <h3 data-testid="modal-reschedule-header" className="text-lg font-semibold text-foreground mb-4">
              {t('title')}
            </h3>

            {isLateReschedule && (
              <div data-testid="modal-reschedule-late-warning" className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
                <p className="text-sm text-amber-700 font-medium">
                  {t('approvalTitle')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('approvalDesc', { hours: LATE_RESCHEDULE_HOURS })}
                </p>
              </div>
            )}

            {loadError ? (
              /* Falha de CARREGAR os horarios. Bloco e testid proprios: o
                 `modal-reschedule-error` abaixo e a falha de REAGENDAR, com
                 outra causa e outra recuperacao. Sem o picker montado, o
                 `schedule-empty` do `SlotPicker` some do caminho de falha. */
              <div
                data-testid="modal-reschedule-load-error"
                role="alert"
                className="flex flex-col items-center justify-center py-10 text-center mb-6"
              >
                <p className="text-destructive font-medium mb-2">{t('loadErrorTitle')}</p>
                <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
                <Button data-testid="modal-reschedule-load-error-retry-button" onClick={refresh} variant="outline">
                  {t('retry')}
                </Button>
              </div>
            ) : (
              <>
                <div data-testid="modal-reschedule-picker" className="flex flex-col lg:flex-row gap-6 mb-6">
                  <CalendarView
                    currentMonth={currentMonth}
                    currentYear={currentYear}
                    slotsByDate={slotsByDate}
                    selectedDate={selectedDate}
                    onSelectDate={handleSelectDate}
                    onPrevMonth={prevMonth}
                    onNextMonth={nextMonth}
                    isLoading={isLoading}
                  />
                  <SlotPicker
                    slots={slotsForDate}
                    selectedSlotId={activeSlot?.id ?? null}
                    onSelectSlot={handleSelectSlot}
                    studentTz={studentTz}
                    adminTz={adminTz}
                    isLoading={isLoading}
                    selectedDate={selectedDate}
                  />
                </div>

                <Link
                  data-testid="modal-reschedule-suggestions-link"
                  href={ROUTES.RESCHEDULE_OPTIONS(session.id)}
                  className="mb-4 flex items-center gap-1.5 text-sm text-primary transition-colors hover:underline"
                >
                  <Sparkles className="h-4 w-4" />
                  {t('suggestionsLink')}
                </Link>
              </>
            )}

            {/* O cancelar fica montado tambem no erro: o usuario precisa
                conseguir sair do modal com a busca quebrada. */}
            <div data-testid="modal-reschedule-actions" className="flex gap-3">
              <Button data-testid="modal-reschedule-cancel-button" variant="outline" onClick={handleClose} className="flex-1">
                {t('cancel')}
              </Button>
              {!loadError && (
                <Button
                  data-testid="modal-reschedule-confirm-button"
                  onClick={handleConfirm}
                  disabled={!activeSlot}
                  className="flex-1"
                >
                  {isLateReschedule ? t('requestSubmit') : t('confirmSubmit')}
                </Button>
              )}
            </div>
          </>
        )}

        {flowState === 'confirming' && (
          <div data-testid="modal-reschedule-loading" className="flex flex-col items-center py-8">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
            <p className="text-foreground font-medium">{t('rescheduling')}</p>
          </div>
        )}

        {flowState === 'success' && (
          <div data-testid="modal-reschedule-success" className="flex flex-col items-center py-8">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-4" />
            <p className="text-foreground font-medium">
              {isLateReschedule ? t('requestSentTitle') : t('doneTitle')}
            </p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              {isLateReschedule ? t('requestSentDesc') : t('doneDesc')}
            </p>
            <Button data-testid="modal-reschedule-success-close-button" onClick={handleSuccessClose} className="mt-6">
              {t('close')}
            </Button>
          </div>
        )}

        {flowState === 'error' && (
          <div data-testid="modal-reschedule-error" className="flex flex-col items-center py-8">
            <XCircle className="h-10 w-10 text-destructive mb-4" />
            <p className="text-foreground font-medium">{t('errorTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              {errorMessage}
            </p>
            <p className="text-sm text-muted-foreground mt-3 text-center">
              {t('slotGoneHint')}
            </p>
            <div data-testid="modal-reschedule-error-actions" className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <Button data-testid="modal-reschedule-error-close-button" variant="outline" onClick={handleClose}>
                {t('close')}
              </Button>
              <Button data-testid="modal-reschedule-error-retry-button" variant="outline" onClick={() => setFlowState('selecting')}>
                {t('retry')}
              </Button>
              <Link
                data-testid="modal-reschedule-error-alternatives-link"
                href={ROUTES.RESCHEDULE_OPTIONS(session.id)}
                className={buttonVariants()}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                {t('alternativesLink')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
