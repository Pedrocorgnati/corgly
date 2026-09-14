'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useCalendar } from '@/hooks/useCalendar';
import { useOwnReservations } from '@/hooks/useOwnReservations';
import { useTimezone } from '@/hooks/useTimezone';
import { CalendarView } from '@/components/calendar/CalendarView';
import { SlotPicker } from '@/components/calendar/SlotPicker';
import { BookingConfirmModal } from '@/components/calendar/BookingConfirmModal';
import { InsufficientCreditsGate } from '@/components/credits/InsufficientCreditsGate';
import { ROUTES } from '@/lib/constants/routes';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

function isPastSlot(slot: AvailabilitySlot): boolean {
  return new Date(slot.startAt).getTime() <= Date.now();
}

interface CalendarScheduleProps {
  creditBalance: number;
  studentTimezone: string;
  adminTimezone: string;
}

export function CalendarSchedule({
  creditBalance,
  studentTimezone,
  adminTimezone,
}: CalendarScheduleProps) {
  const router = useRouter();
  const {
    currentMonth,
    currentYear,
    slotsByDate,
    isLoading,
    error,
    prevMonth,
    nextMonth,
    refresh,
  } = useCalendar({ timeZone: studentTimezone });
  const {
    ownSlots,
    ownSlotsByDate,
    refresh: refreshOwnReservations,
  } = useOwnReservations({ currentMonth, currentYear, timeZone: studentTimezone });
  const { studentTz, adminTz } = useTimezone(studentTimezone, adminTimezone);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [modalSlotId, setModalSlotId] = useState<string | null>(null);

  // Horario do proprio aluno nunca entra na lista selecionavel (item 036). A rota
  // publica ja o exclui por estar ocupado; o filtro aqui mantem a garantia quando
  // as duas leituras chegam fora de ordem (reserva feita em outra aba).
  const ownSlotIds = new Set(ownSlots.map((slot) => slot.id));
  const slotsForDate = selectedDate
    ? (slotsByDate[selectedDate] ?? []).filter((slot) => !ownSlotIds.has(slot.id))
    : [];
  const ownSlotsForDate = selectedDate ? (ownSlotsByDate[selectedDate] ?? []) : [];
  const hasCredits = creditBalance > 0;
  // A selecao so vale enquanto o slot continua na lista: quando o horario vence
  // e o `useCalendar` o remove, o botao de confirmar e o modal somem junto.
  const activeSlot =
    selectedSlot && slotsForDate.some((slot) => slot.id === selectedSlot.id)
      ? selectedSlot
      : null;

  const handleSelectSlot = (slot: AvailabilitySlot) => {
    if (!hasCredits || ownSlotIds.has(slot.id)) return;
    // Aba em segundo plano atrasa o timer do hook; o clique revalida o instante
    // e recarrega a lista, que volta do servidor sem o horario vencido.
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

  const handleOpenModal = () => {
    if (!activeSlot || !hasCredits) return;
    if (isPastSlot(activeSlot)) {
      setSelectedSlot(null);
      refresh();
      return;
    }
    setModalSlotId(activeSlot.id);
  };

  const handleCloseModal = () => {
    setModalSlotId(null);
  };

  const handleRetry = () => {
    refresh();
    refreshOwnReservations();
  };

  const handleBookingSuccess = () => {
    setModalSlotId(null);
    setSelectedSlot(null);
    setSelectedDate(null);
    refresh();
    refreshOwnReservations();
    router.push(ROUTES.HISTORY);
  };

  if (error) {
    return (
      <div data-testid="schedule-error" className="flex flex-col items-center justify-center py-12 text-center" role="alert">
        <p className="text-destructive font-medium mb-2">Erro ao carregar horários</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button data-testid="schedule-retry-button" onClick={handleRetry} variant="outline">
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <>
      {!hasCredits && <InsufficientCreditsGate balance={creditBalance} />}

      <div data-testid="schedule-calendar-section" className="flex flex-col gap-6 lg:flex-row">
        <CalendarView
          currentMonth={currentMonth}
          currentYear={currentYear}
          slotsByDate={slotsByDate}
          ownSlotsByDate={ownSlotsByDate}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          isLoading={isLoading}
          timeZone={studentTimezone}
        />

        <div className="flex flex-col gap-4">
          <SlotPicker
            slots={slotsForDate}
            ownSlots={ownSlotsForDate}
            selectedSlotId={hasCredits ? (activeSlot?.id ?? null) : null}
            onSelectSlot={handleSelectSlot}
            studentTz={studentTz}
            adminTz={adminTz}
            isLoading={isLoading}
            selectedDate={selectedDate}
            isDisabled={!hasCredits}
            disabledReasonId={!hasCredits ? 'insufficient-credits-title' : undefined}
          />

          {activeSlot && hasCredits && (
            <Button data-testid="schedule-confirm-slot-button" onClick={handleOpenModal} className="w-full h-11">
              Confirmar horário
            </Button>
          )}
        </div>
      </div>

      {activeSlot && (
        <BookingConfirmModal
          slot={activeSlot}
          studentTz={studentTz}
          adminTz={adminTz}
          open={modalSlotId === activeSlot.id}
          onClose={handleCloseModal}
          onSuccess={handleBookingSuccess}
        />
      )}
    </>
  );
}
