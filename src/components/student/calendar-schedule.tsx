'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, CreditCard, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// TODO: Replace with real API call — GET /api/v1/schedule/availability
const MOCK_SLOTS: Record<string, Array<{ id: string; time: string; adminTime: string; occupied: boolean }>> = {};

interface SelectedSlot {
  date: string;
  time: string;
  slotId: string;
}

export function CalendarSchedule() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  const formatDateKey = (day: number) =>
    `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const isPast = (day: number) => {
    const d = new Date(currentYear, currentMonth, day);
    d.setHours(23, 59, 59, 999);
    return d < today;
  };

  const isToday = (day: number) =>
    day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

  const handleConfirm = async () => {
    if (!selectedSlot) return;
    setIsConfirming(true);
    try {
      // TODO: Implementar backend — POST /api/v1/schedule/book
      await new Promise((r) => setTimeout(r, 500));
      toast.error('Não implementado — execute /auto-flow execute');
    } catch {
      toast.error('Erro ao agendar. Tente novamente.');
    } finally {
      setIsConfirming(false);
    }
  };

  const slots = selectedDate ? (MOCK_SLOTS[selectedDate] ?? []) : [];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Calendar */}
      <div className="flex-1 bg-card border border-border rounded-2xl p-4 shadow-sm">
        {/* Nav */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="font-semibold text-foreground">
            {MONTHS[currentMonth]} {currentYear}
          </h2>
          <button
            onClick={nextMonth}
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Weekdays */}
        <div className="grid grid-cols-7 text-xs text-muted-foreground font-medium py-2 text-center">
          {WEEKDAYS.map(d => <span key={d}>{d}</span>)}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {/* Days */}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const dateKey = formatDateKey(day);
            const past = isPast(day);
            const today_ = isToday(day);
            const hasSlots = !past && MOCK_SLOTS[dateKey]?.some(s => !s.occupied);
            const isSelected = selectedDate === dateKey;

            return (
              <button
                key={day}
                onClick={() => !past && setSelectedDate(isSelected ? null : dateKey)}
                disabled={past}
                className={cn(
                  'flex flex-col items-center justify-center h-10 w-full rounded-full text-sm transition-colors',
                  past && 'text-muted-foreground cursor-not-allowed pointer-events-none',
                  !past && !isSelected && 'hover:bg-muted text-foreground',
                  today_ && !isSelected && 'border-2 border-primary text-primary font-semibold',
                  isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
                aria-label={today_ ? `Hoje, ${day}` : `${day}`}
              >
                <span>{day}</span>
                {hasSlots && (
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full mt-0.5',
                    isSelected ? 'bg-primary-foreground' : 'bg-[#059669]',
                  )} />
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          • Dias com horários disponíveis
        </p>
      </div>

      {/* Slot Picker */}
      <div className="lg:w-72 bg-card border border-border rounded-2xl p-4 shadow-sm">
        {!selectedDate ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground">
            <p className="text-sm text-center">Selecione um dia no calendário para ver os horários disponíveis</p>
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-foreground mb-1">Horários disponíveis</h3>
            <p className="text-xs text-muted-foreground mb-4">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </p>

            {slots.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p className="text-sm">Não há horários disponíveis neste dia.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => !slot.occupied && setSelectedSlot({
                      date: selectedDate,
                      time: slot.time,
                      slotId: slot.id,
                    })}
                    disabled={slot.occupied}
                    className={cn(
                      'w-full p-4 rounded-xl border text-left transition-all duration-[120ms]',
                      slot.occupied && 'bg-muted border-border opacity-60 cursor-not-allowed',
                      !slot.occupied && selectedSlot?.slotId !== slot.id && 'border-border hover:border-primary hover:bg-primary/5',
                      selectedSlot?.slotId === slot.id && 'border-2 border-primary bg-primary/10',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={cn(
                          'text-sm font-medium',
                          selectedSlot?.slotId === slot.id ? 'text-primary' : 'text-foreground',
                          slot.occupied && 'text-muted-foreground',
                        )}>
                          {slot.time}
                        </p>
                        {slot.adminTime && (
                          <p className="text-xs text-muted-foreground">{slot.adminTime}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> 50 min
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CreditCard className="h-3 w-3" /> 1 crédito
                        </p>
                        {slot.occupied && <p className="text-xs text-muted-foreground">Ocupado</p>}
                        {selectedSlot?.slotId === slot.id && (
                          <p className="text-xs text-primary flex items-center gap-1">
                            <Check className="h-3 w-3" /> Selecionado
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedSlot && (
              <Button
                onClick={handleConfirm}
                disabled={isConfirming}
                className="w-full h-11"
              >
                {isConfirming ? 'Confirmando...' : 'Confirmar horário'}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
