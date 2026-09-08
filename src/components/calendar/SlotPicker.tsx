'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, CreditCard, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimezoneDisplay } from '@/components/ui/timezone-display';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

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

/**
 * Ate 2026-09-07 a lista de meses era uma constante de modulo em portugues e as
 * duas formatacoes cravavam `'pt-BR'`: quem lia a tela em outro idioma via
 * "quinta-feira, 4 de setembro" no meio de uma interface em ingles. Agora o
 * locale do leitor entra como parametro.
 */
function formatSelectedDate(dateStr: string, locale: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function SlotPicker({
  slots,
  selectedSlotId,
  onSelectSlot,
  studentTz,
  isLoading,
  selectedDate,
}: SlotPickerProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo aluno.
  const t = useTranslations('calendar.slots');
  const locale = useLocale();

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: studentTz,
      }),
    [locale, studentTz],
  );

  if (isLoading) {
    return (
      <div data-testid="schedule-loading" className="lg:w-72 bg-card border border-border rounded-2xl p-4 shadow-sm animate-pulse">
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
      <div data-testid="schedule-slot-picker-idle" className="lg:w-72 bg-card border border-border rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground">
          <p className="text-sm text-center">
            {t('idle')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="schedule-slot-picker" className="lg:w-72 bg-card border border-border rounded-2xl p-4 shadow-sm">
      <h3 className="font-semibold text-foreground mb-1">{t('title')}</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {formatSelectedDate(selectedDate, locale)}
      </p>

      {slots.length === 0 ? (
        <div data-testid="schedule-empty" className="py-8 text-center text-muted-foreground">
          <p className="text-sm">{t('empty')}</p>
        </div>
      ) : (
        <div data-testid="schedule-slot-list" className="space-y-2" role="listbox" aria-label={t('listLabel')}>
          {slots.map((slot) => {
            const isSelected = selectedSlotId === slot.id;
            const studentTime = timeFormatter.format(new Date(slot.startAt));

            return (
              <button
                key={slot.id}
                data-testid={`schedule-slot-${slot.id}`}
                onClick={() => onSelectSlot(slot)}
                role="option"
                aria-selected={isSelected}
                aria-label={t('slotAria', {
                  time: studentTime,
                  minutes: SESSION_DURATION_MINUTES,
                  count: CREDITS_PER_SESSION,
                })}
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
                      <Clock className="h-3 w-3" /> {t('minutes', { minutes: SESSION_DURATION_MINUTES })}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CreditCard className="h-3 w-3" /> {t('credits', { count: CREDITS_PER_SESSION })}
                    </p>
                    {isSelected && (
                      <p className="text-xs text-primary flex items-center gap-1">
                        <Check className="h-3 w-3" /> {t('selected')}
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
