'use client';

import { useState } from 'react';
import { CalendarView } from '@/components/calendar/CalendarView';
import { useCalendar } from '@/hooks/useCalendar';
import { SessionStatus, SESSION_STATUS_MAP } from '@/lib/constants/enums';
import { cn } from '@/lib/utils';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

interface SessionSlot extends AvailabilitySlot {
  sessionStatus?: string;
  studentName?: string;
}

interface AdminCalendarProps {
  sessions?: Array<{
    id: string;
    startAt: string;
    endAt: string;
    status: string;
    studentName?: string;
    availabilitySlotId?: string;
  }>;
  onSlotClick?: (slot: AvailabilitySlot, session?: { id: string; status: string; studentName?: string }) => void;
}

export function AdminCalendar({ sessions = [], onSlotClick }: AdminCalendarProps) {
  const {
    currentMonth,
    currentYear,
    slotsByDate,
    isLoading,
    prevMonth,
    nextMonth,
  } = useCalendar();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const slotsForDate = selectedDate ? (slotsByDate[selectedDate] ?? []) : [];

  // Map sessions to slots for color coding
  const sessionBySlotTime = new Map<string, { id: string; status: string; studentName?: string }>();
  for (const s of sessions) {
    sessionBySlotTime.set(s.startAt, {
      id: s.id,
      status: s.status,
      studentName: s.studentName,
    });
  }

  const getSlotColor = (slot: AvailabilitySlot): { text: string; bg: string } => {
    if (slot.isBlocked) {
      return { text: 'text-muted-foreground', bg: 'bg-muted' };
    }
    const session = sessionBySlotTime.get(slot.startAt);
    if (session) {
      const config = SESSION_STATUS_MAP[session.status as SessionStatus];
      if (config) return { text: config.color, bg: config.bg };
    }
    // Available slot — green
    return { text: 'text-emerald-700', bg: 'bg-emerald-50' };
  };

  return (
    <div className="space-y-6">
      <CalendarView
        currentMonth={currentMonth}
        currentYear={currentYear}
        slotsByDate={slotsByDate}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        isLoading={isLoading}
      />

      {/* Slot details for selected date */}
      {selectedDate && (
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-foreground mb-3">
            Detalhes — {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h3>

          {slotsForDate.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum slot neste dia.</p>
          ) : (
            <div className="space-y-2">
              {slotsForDate.map((slot) => {
                const colors = getSlotColor(slot);
                const session = sessionBySlotTime.get(slot.startAt);
                const statusConfig = session
                  ? SESSION_STATUS_MAP[session.status as SessionStatus]
                  : null;

                return (
                  <button
                    key={slot.id}
                    onClick={() => onSlotClick?.(slot, session)}
                    className={cn(
                      'w-full flex items-center justify-between p-3 rounded-lg border border-border text-left transition-colors hover:border-primary',
                      colors.bg,
                    )}
                  >
                    <div>
                      <p className={cn('text-sm font-medium', colors.text)}>
                        {new Date(slot.startAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' - '}
                        {new Date(slot.endAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {session?.studentName && (
                        <p className="text-xs text-muted-foreground">{session.studentName}</p>
                      )}
                    </div>
                    <span className={cn('text-xs font-medium', colors.text)}>
                      {slot.isBlocked
                        ? 'Bloqueado'
                        : statusConfig
                          ? statusConfig.label
                          : 'Disponível'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500" /> Disponível
        </span>
        {Object.entries(SESSION_STATUS_MAP).map(([key, config]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={cn('w-3 h-3 rounded-full', config.bg, 'border', 'border-current', config.color)} />
            {config.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-muted border border-muted-foreground" /> Bloqueado
        </span>
      </div>
    </div>
  );
}
