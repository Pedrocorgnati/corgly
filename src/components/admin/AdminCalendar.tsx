'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarView } from '@/components/calendar/CalendarView';
import { useCalendar } from '@/hooks/useCalendar';
import { SessionStatus, SESSION_STATUS_MAP, SESSION_STATUS_LABEL_KEY } from '@/lib/constants/enums';
import { cn } from '@/lib/utils';
import type { AvailabilitySlot, UseCalendarReturn } from '@/hooks/useCalendar';

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
  /**
   * Fonte de dados vinda de fora (ex.: `useAdminSchedule`, que enxerga slots
   * bloqueados e vendidos). Quando ausente, o componente cai no `useCalendar`
   * publico de sempre.
   */
  calendar?: UseCalendarReturn;
}

export function AdminCalendar({ sessions = [], onSlotClick, calendar }: AdminCalendarProps) {
  const tStatus = useTranslations('sessionStatus');
  // Hook chamado incondicionalmente (regra dos hooks); `enabled: false` evita o
  // fetch publico redundante quando a fonte ja vem por prop.
  const internal = useCalendar({ enabled: !calendar });
  const {
    currentMonth,
    currentYear,
    slotsByDate,
    isLoading,
    error,
    prevMonth,
    nextMonth,
    refresh,
  } = calendar ?? internal;

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
    <div data-testid="admin-calendar" className="space-y-6">
      <CalendarView
        currentMonth={currentMonth}
        currentYear={currentYear}
        slotsByDate={slotsByDate}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        isLoading={isLoading}
        error={error}
        onRetry={refresh}
      />

      {/* Slot details for selected date.
          `!error` mata o falso negativo do dia quando a busca falhou.
          `!isLoading` fecha a janela do retry: `useAdminSchedule` zera `error` e
          liga `isLoading` no inicio de cada busca, entao sem este termo o painel
          voltaria a exibir "Nenhum slot neste dia." por cima de uma busca em
          andamento. Este painel e irmao do `CalendarView`, nao filho, entao a
          precedencia resolvida la dentro nao alcanca esta subarvore. */}
      {selectedDate && !error && !isLoading && (
        <div data-testid="admin-calendar-day-details" className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <h3 data-testid="admin-calendar-day-details-header" className="font-semibold text-foreground mb-3">
            Detalhes — {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h3>

          {slotsForDate.length === 0 ? (
            <p data-testid="admin-calendar-day-empty" className="text-sm text-muted-foreground">Nenhum slot neste dia.</p>
          ) : (
            <div data-testid="admin-calendar-slot-list" className="space-y-2">
              {slotsForDate.map((slot) => {
                const colors = getSlotColor(slot);
                const session = sessionBySlotTime.get(slot.startAt);

                return (
                  <button
                    key={slot.id}
                    data-testid={`admin-calendar-slot-${slot.id}`}
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
                        : session && SESSION_STATUS_LABEL_KEY[session.status as SessionStatus]
                          ? tStatus(SESSION_STATUS_LABEL_KEY[session.status as SessionStatus])
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
      <div data-testid="admin-calendar-legend" className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500" /> Disponível
        </span>
        {(Object.keys(SESSION_STATUS_MAP) as SessionStatus[]).map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span
              className={cn(
                'w-3 h-3 rounded-full',
                SESSION_STATUS_MAP[key].bg,
                'border',
                'border-current',
                SESSION_STATUS_MAP[key].color,
              )}
            />
            {tStatus(SESSION_STATUS_LABEL_KEY[key])}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-muted border border-muted-foreground" /> Bloqueado
        </span>
      </div>
    </div>
  );
}
