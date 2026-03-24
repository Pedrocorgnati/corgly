'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface CalendarViewProps {
  currentMonth: number;
  currentYear: number;
  slotsByDate: Record<string, AvailabilitySlot[]>;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  isLoading: boolean;
}

export function CalendarView({
  currentMonth,
  currentYear,
  slotsByDate,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  isLoading,
}: CalendarViewProps) {
  const today = new Date();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const formatDateKey = (day: number) =>
    `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const isPast = (day: number) => {
    const d = new Date(currentYear, currentMonth, day);
    d.setHours(23, 59, 59, 999);
    return d < today;
  };

  const isToday = (day: number) =>
    day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

  if (isLoading) {
    return (
      <div className="flex-1 bg-card border border-border rounded-2xl p-4 shadow-sm animate-pulse">
        <div className="h-8 w-48 bg-muted rounded mx-auto mb-4" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-card border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onPrevMonth}
          className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="font-semibold text-foreground">
          {MONTHS[currentMonth]} {currentYear}
        </h2>
        <button
          onClick={onNextMonth}
          className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-xs text-muted-foreground font-medium py-2 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendário">
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} role="gridcell" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dateKey = formatDateKey(day);
          const past = isPast(day);
          const todayMark = isToday(day);
          const hasSlots = !past && (slotsByDate[dateKey]?.length ?? 0) > 0;
          const isSelected = selectedDate === dateKey;

          return (
            <button
              key={day}
              onClick={() => !past && onSelectDate(isSelected ? null : dateKey)}
              disabled={past}
              role="gridcell"
              aria-selected={isSelected}
              aria-label={`${todayMark ? 'Hoje, ' : ''}${day} de ${MONTHS[currentMonth]}${hasSlots ? ', horários disponíveis' : ''}`}
              className={cn(
                'flex flex-col items-center justify-center h-10 w-full rounded-full text-sm transition-colors',
                past && 'text-muted-foreground/40 cursor-not-allowed pointer-events-none',
                !past && !isSelected && 'hover:bg-muted text-foreground',
                todayMark && !isSelected && 'border-2 border-primary text-primary font-semibold',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              <span>{day}</span>
              {hasSlots && (
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full mt-0.5',
                    isSelected ? 'bg-primary-foreground' : 'bg-emerald-500',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-center flex items-center justify-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        Dias com horários disponíveis
      </p>
    </div>
  );
}
