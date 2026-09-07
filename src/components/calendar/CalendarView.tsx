'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  /**
   * Falha ESPERADA de carregamento (a server action devolveu `{ error }`).
   * Opcional porque o call site do aluno (`calendar-schedule.tsx`) ja faz o
   * proprio early return de erro antes de montar este componente.
   */
  error?: string | null;
  /** Repete a busca sem recarregar a rota; normalmente o `refresh` do hook. */
  onRetry?: () => void;
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
  error,
  onRetry,
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

  // Precedencia explicita: o erro vence o carregamento. Os hooks so publicam
  // `error` no `finally` que zera `isLoading`, entao na pratica os dois nunca
  // sao verdadeiros ao mesmo tempo; deixar a ordem no codigo evita depender
  // dessa coincidencia de ordem de `setState`.
  if (error) {
    return (
      <div
        data-testid="calendar-view-error"
        role="alert"
        className="flex-1 bg-card border border-border rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center py-12 text-center"
      >
        <p className="text-destructive font-medium mb-2">Erro ao carregar horários</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        {onRetry && (
          <Button data-testid="calendar-view-error-retry-button" onClick={onRetry} variant="outline">
            Tentar novamente
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div data-testid="calendar-view-loading" className="flex-1 bg-card border border-border rounded-2xl p-4 shadow-sm animate-pulse">
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
    <div data-testid="calendar-view" className="flex-1 bg-card border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <button
          data-testid="calendar-view-prev-month-button"
          onClick={onPrevMonth}
          className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 data-testid="calendar-view-month-label" className="font-semibold text-foreground">
          {MONTHS[currentMonth]} {currentYear}
        </h2>
        <button
          data-testid="calendar-view-next-month-button"
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

      <div data-testid="calendar-view-grid" className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendário">
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
              data-testid={`calendar-view-day-${dateKey}`}
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
