'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { CalendarView } from '@/components/calendar/CalendarView';
import { SlotPicker } from '@/components/calendar/SlotPicker';
import { useCalendar } from '@/hooks/useCalendar';
import { useTimezone } from '@/hooks/useTimezone';
import { rescheduleSession } from '@/actions/sessions';
import { ROUTES } from '@/lib/constants/routes';
import { toast } from 'sonner';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

const LATE_RESCHEDULE_HOURS = 12;

type FlowState = 'selecting' | 'confirming' | 'success' | 'error';

interface RescheduleFlowProps {
  session: { id: string; startAt: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRescheduled: () => void;
}

export function RescheduleFlow({
  session,
  open,
  onOpenChange,
  onRescheduled,
}: RescheduleFlowProps) {
  const {
    currentMonth,
    currentYear,
    slotsByDate,
    isLoading,
    prevMonth,
    nextMonth,
  } = useCalendar();
  const { studentTz } = useTimezone();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [flowState, setFlowState] = useState<FlowState>('selecting');
  const [errorMessage, setErrorMessage] = useState('');

  if (!open) return null;

  const hoursUntilSession =
    (new Date(session.startAt).getTime() - Date.now()) / (1000 * 60 * 60);
  const isLateReschedule = hoursUntilSession < LATE_RESCHEDULE_HOURS;

  const slotsForDate = selectedDate ? (slotsByDate[selectedDate] ?? []) : [];

  const handleSelectSlot = (slot: AvailabilitySlot) => {
    setSelectedSlot((prev) => (prev?.id === slot.id ? null : slot));
  };

  const handleSelectDate = (date: string | null) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleConfirm = async () => {
    if (!selectedSlot) return;
    setFlowState('confirming');
    try {
      const result = await rescheduleSession(session.id, selectedSlot.id);
      if (result.error) {
        setErrorMessage(result.error);
        setFlowState('error');
        return;
      }
      setFlowState('success');
      if (isLateReschedule) {
        toast.success('Pedido de reagendamento enviado para aprovação.');
      } else {
        toast.success('Sessão reagendada com sucesso!');
      }
    } catch {
      setErrorMessage('Erro ao reagendar. Tente novamente.');
      setFlowState('error');
    }
  };

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

  return (
    <div
      data-testid="modal-reschedule"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Reagendar sessão"
    >
      <div className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-3xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {flowState === 'selecting' && (
          <>
            <h3 data-testid="modal-reschedule-header" className="text-lg font-semibold text-foreground mb-4">
              Reagendar sessão
            </h3>

            {isLateReschedule && (
              <div data-testid="modal-reschedule-late-warning" className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
                <p className="text-sm text-amber-700 font-medium">
                  Seu pedido será enviado para aprovação do professor
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  A sessão original começa em menos de {LATE_RESCHEDULE_HOURS} horas.
                </p>
              </div>
            )}

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
                selectedSlotId={selectedSlot?.id ?? null}
                onSelectSlot={handleSelectSlot}
                studentTz={studentTz}
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
              Ver horários alternativos sugeridos
            </Link>

            <div data-testid="modal-reschedule-actions" className="flex gap-3">
              <Button data-testid="modal-reschedule-cancel-button" variant="outline" onClick={handleClose} className="flex-1">
                Cancelar
              </Button>
              <Button
                data-testid="modal-reschedule-confirm-button"
                onClick={handleConfirm}
                disabled={!selectedSlot}
                className="flex-1"
              >
                {isLateReschedule ? 'Solicitar reagendamento' : 'Confirmar reagendamento'}
              </Button>
            </div>
          </>
        )}

        {flowState === 'confirming' && (
          <div data-testid="modal-reschedule-loading" className="flex flex-col items-center py-8">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
            <p className="text-foreground font-medium">Reagendando...</p>
          </div>
        )}

        {flowState === 'success' && (
          <div data-testid="modal-reschedule-success" className="flex flex-col items-center py-8">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-4" />
            <p className="text-foreground font-medium">
              {isLateReschedule ? 'Pedido enviado!' : 'Sessão reagendada!'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              {isLateReschedule
                ? 'Seu pedido foi enviado para aprovação do professor.'
                : 'Sua sessão foi reagendada com sucesso.'}
            </p>
            <Button data-testid="modal-reschedule-success-close-button" onClick={handleSuccessClose} className="mt-6">
              Fechar
            </Button>
          </div>
        )}

        {flowState === 'error' && (
          <div data-testid="modal-reschedule-error" className="flex flex-col items-center py-8">
            <XCircle className="h-10 w-10 text-destructive mb-4" />
            <p className="text-foreground font-medium">Erro ao reagendar</p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              {errorMessage}
            </p>
            <p className="text-sm text-muted-foreground mt-3 text-center">
              O horário escolhido pode não estar mais disponível. Veja as
              alternativas sugeridas dentro da política de reagendamento.
            </p>
            <div data-testid="modal-reschedule-error-actions" className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <Button data-testid="modal-reschedule-error-close-button" variant="outline" onClick={handleClose}>
                Fechar
              </Button>
              <Button data-testid="modal-reschedule-error-retry-button" variant="outline" onClick={() => setFlowState('selecting')}>
                Tentar novamente
              </Button>
              <Link
                data-testid="modal-reschedule-error-alternatives-link"
                href={ROUTES.RESCHEDULE_OPTIONS(session.id)}
                className={buttonVariants()}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Ver alternativas
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
