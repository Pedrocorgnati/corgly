'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useCalendar } from '@/hooks/useCalendar';
import { useTimezone } from '@/hooks/useTimezone';
import { CalendarView } from '@/components/calendar/CalendarView';
import { SlotPicker } from '@/components/calendar/SlotPicker';
import { BookingConfirmModal } from '@/components/calendar/BookingConfirmModal';
import { InsufficientCreditsGate } from '@/components/credits/InsufficientCreditsGate';
import { ROUTES } from '@/lib/constants/routes';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

interface CalendarScheduleProps {
  creditBalance: number;
}

export function CalendarSchedule({ creditBalance }: CalendarScheduleProps) {
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
  } = useCalendar();
  const { studentTz } = useTimezone();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [showModal, setShowModal] = useState(false);

  const slotsForDate = selectedDate ? (slotsByDate[selectedDate] ?? []) : [];
  const hasCredits = creditBalance > 0;

  const handleSelectSlot = (slot: AvailabilitySlot) => {
    if (!hasCredits) return;
    setSelectedSlot((prev) => (prev?.id === slot.id ? null : slot));
  };

  const handleSelectDate = (date: string | null) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleOpenModal = () => {
    if (selectedSlot && hasCredits) setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleBookingSuccess = () => {
    setShowModal(false);
    setSelectedSlot(null);
    setSelectedDate(null);
    refresh();
    router.push(ROUTES.HISTORY);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
        <p className="text-destructive font-medium mb-2">Erro ao carregar horários</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button onClick={refresh} variant="outline">
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <>
      {!hasCredits && <InsufficientCreditsGate balance={creditBalance} />}

      <div className="flex flex-col gap-6 lg:flex-row">
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

        <div className="flex flex-col gap-4">
          <SlotPicker
            slots={slotsForDate}
            selectedSlotId={hasCredits ? (selectedSlot?.id ?? null) : null}
            onSelectSlot={handleSelectSlot}
            studentTz={studentTz}
            isLoading={isLoading}
            selectedDate={selectedDate}
          />

          {selectedSlot && hasCredits && (
            <Button onClick={handleOpenModal} className="w-full h-11">
              Confirmar horário
            </Button>
          )}
        </div>
      </div>

      {selectedSlot && (
        <BookingConfirmModal
          slot={selectedSlot}
          studentTz={studentTz}
          open={showModal}
          onClose={handleCloseModal}
          onSuccess={handleBookingSuccess}
        />
      )}
    </>
  );
}
