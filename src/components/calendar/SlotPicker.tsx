'use client';

import { Clock, CreditCard, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimezoneDisplay } from '@/components/ui/timezone-display';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const SESSION_DURATION_MINUTES = 50;
const CREDITS_PER_SESSION = 1;

interface SlotPickerProps {
  slots: AvailabilitySlot[];
  selectedSlotId: string | null;
  onSelectSlot: (slot: AvailabilitySlot) => void;
  studentTz: string;
  isLoading: boolean;
  selectedDate: string | null;
}

function formatSelectedDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatTimeInTz(isoStr: string, tz: string): string {
  const date = new Date(isoStr);
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(date);
}

export function SlotPicker({
  slots,
  selectedSlotId,
  onSelectSlot,
  studentTz,
  isLoading,
  selectedDate,
}: SlotPickerProps) {
  if (isLoading) {
    return (
      <div className="lg:w-72 bg-card border border-border rounded-2xl p-4 shadow-sm animate-pulse">
        <div className="h-5 w-40 bg-muted rounded mb-2" />
        <div className="h-4 w-32 bg-muted rounded mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!selectedDate) {
    return (
      <div className="lg:w-72 bg-card border border-border rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground">
          <p className="text-sm text-center">
            Selecione um dia no calendário para ver os horários disponíveis
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:w-72 bg-card border border-border rounded-2xl p-4 shadow-sm">
      <h3 className="font-semibold text-foreground mb-1">Horários disponíveis</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {formatSelectedDate(selectedDate)}
      </p>

      {slots.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <p className="text-sm">Nenhum horário disponível neste dia.</p>
        </div>
      ) : (
        <div className="space-y-2" role="listbox" aria-label="Horários disponíveis">
          {slots.map((slot) => {
            const isSelected = selectedSlotId === slot.id;
            const studentTime = formatTimeInTz(slot.startAt, studentTz);

            return (
              <button
                key={slot.id}
                onClick={() => onSelectSlot(slot)}
                role="option"
                aria-selected={isSelected}
                aria-label={`${studentTime}, ${SESSION_DURATION_MINUTES} minutos, ${CREDITS_PER_SESSION} crédito`}
                className={cn(
                  'w-full p-4 rounded-xl border text-left transition-all duration-[120ms]',
                  !isSelected && 'border-border hover:border-primary hover:bg-primary/5',
                  isSelected && 'border-2 border-primary bg-primary/10',
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className={cn(
                        'text-sm font-medium',
                        isSelected ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {studentTime}
                    </p>
                    <TimezoneDisplay
                      time={slot.startAt}
                      studentTz={studentTz}
                      adminTz="America/Sao_Paulo"
                      format="short"
                      className="text-xs"
                    />
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {SESSION_DURATION_MINUTES} min
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CreditCard className="h-3 w-3" /> {CREDITS_PER_SESSION} crédito
                    </p>
                    {isSelected && (
                      <p className="text-xs text-primary flex items-center gap-1">
                        <Check className="h-3 w-3" /> Selecionado
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
