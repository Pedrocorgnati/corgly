'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useCalendar } from '@/hooks/useCalendar';
import { useTimezone } from '@/hooks/useTimezone';
import { CalendarView } from '@/components/calendar/CalendarView';
import { SlotPicker } from '@/components/calendar/SlotPicker';
import { BookingConfirmModal } from '@/components/calendar/BookingConfirmModal';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

export function CalendarSchedule() {
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

  const handleSelectSlot = (slot: AvailabilitySlot) => {
    setSelectedSlot((prev) => (prev?.id === slot.id ? null : slot));
  };

  const handleSelectDate = (date: string | null) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleOpenModal = () => {
    if (selectedSlot) setShowModal(true);
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
      <div className="flex flex-col lg:flex-row gap-6">
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
            selectedSlotId={selectedSlot?.id ?? null}
            onSelectSlot={handleSelectSlot}
            studentTz={studentTz}
            isLoading={isLoading}
            selectedDate={selectedDate}
          />

          {selectedSlot && (
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
