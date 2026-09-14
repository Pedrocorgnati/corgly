'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, CreditCard, Check, CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimezoneDisplay } from '@/components/ui/timezone-display';
import type { AvailabilitySlot } from '@/hooks/useCalendar';
import type { OwnReservedSlot } from '@/actions/sessions';
import { slotDurationMinutes } from '@/lib/bookings/slot-duration';

const CREDITS_PER_SESSION = 1;

interface SlotPickerProps {
  slots: AvailabilitySlot[];
  selectedSlotId: string | null;
  onSelectSlot: (slot: AvailabilitySlot) => void;
  studentTz: string;
  adminTz: string;
  isLoading: boolean;
  selectedDate: string | null;
  isDisabled?: boolean;
  disabledReasonId?: string;
  /**
   * Horarios do dia que o proprio aluno ja reservou (item 036). Aparecem
   * identificados e fora de selecao, com estado proprio, distinto do
   * `isDisabled` de saldo zero. Opcional: o reagendamento nao passa a prop e
   * continua como antes.
   */
  ownSlots?: OwnReservedSlot[];
}

type SlotEntry =
  | { kind: 'free'; slot: AvailabilitySlot }
  | { kind: 'own'; slot: OwnReservedSlot };

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
  adminTz,
  isLoading,
  selectedDate,
  isDisabled = false,
  disabledReasonId,
  ownSlots,
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

  const entries = useMemo<SlotEntry[]>(() => {
    const own = ownSlots ?? [];
    if (own.length === 0) {
      return slots.map((slot) => ({ kind: 'free' as const, slot }));
    }
    // O proprio vence: se a lista livre trouxer o mesmo horario (leituras fora de
    // ordem), ele aparece uma vez so, como reservado, nunca como opcao clicavel.
    const ownIds = new Set(own.map((slot) => slot.id));
    return [
      ...slots
        .filter((slot) => !ownIds.has(slot.id))
        .map((slot) => ({ kind: 'free' as const, slot })),
      ...own.map((slot) => ({ kind: 'own' as const, slot })),
    ].sort((a, b) => new Date(a.slot.startAt).getTime() - new Date(b.slot.startAt).getTime());
  }, [slots, ownSlots]);

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

      {entries.length === 0 ? (
        <div data-testid="schedule-empty" className="py-8 text-center text-muted-foreground">
          <p className="text-sm">{t('empty')}</p>
        </div>
      ) : (
        <div data-testid="schedule-slot-list" className="space-y-2" role="listbox" aria-label={t('listLabel')}>
          {entries.map((entry) => {
            const studentTime = timeFormatter.format(new Date(entry.slot.startAt));

            if (entry.kind === 'own') {
              // Sem `onClick` de proposito: a reserva do proprio aluno nao e opcao
              // de nova reserva, e o saldo zero nao se aplica a ela.
              return (
                <div
                  key={`own-${entry.slot.id}`}
                  data-testid={`schedule-slot-own-${entry.slot.id}`}
                  role="option"
                  aria-selected={false}
                  aria-disabled="true"
                  aria-label={t('ownReservedAria', { time: studentTime })}
                  className="w-full p-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-left cursor-default"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{studentTime}</p>
                      <TimezoneDisplay
                        time={entry.slot.startAt}
                        studentTz={studentTz}
                        adminTz={adminTz}
                        format="short"
                        className="text-xs"
                      />
                    </div>
                    <p className="text-xs font-medium text-primary flex items-center gap-1">
                      <CalendarCheck className="h-3 w-3" /> {t('ownReserved')}
                    </p>
                  </div>
                </div>
              );
            }

            const slot = entry.slot;
            const isSelected = selectedSlotId === slot.id;
            // Duracao lida do proprio horario. `null` (endAt ilegivel, igual ou
            // anterior ao inicio) omite o trecho; o horario continua selecionavel.
            const minutes = slotDurationMinutes(slot);

            return (
              <button
                key={slot.id}
                data-testid={`schedule-slot-${slot.id}`}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (!isDisabled) onSelectSlot(slot);
                }}
                role="option"
                aria-selected={isSelected}
                aria-disabled={isDisabled}
                aria-describedby={isDisabled ? disabledReasonId : undefined}
                aria-label={
                  minutes === null
                    ? t('slotAriaNoDuration', { time: studentTime, count: CREDITS_PER_SESSION })
                    : t('slotAria', { time: studentTime, minutes, count: CREDITS_PER_SESSION })
                }
                className={cn(
                  'w-full p-4 rounded-xl border text-left transition-all duration-[120ms]',
                  isDisabled &&
                    'cursor-not-allowed border-border bg-muted/50 text-muted-foreground opacity-60',
                  !isSelected && 'border-border hover:border-primary hover:bg-primary/5',
                  isDisabled && 'hover:border-border hover:bg-muted/50',
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
                      adminTz={adminTz}
                      format="short"
                      className="text-xs"
                    />
                  </div>
                  <div className="text-right">
                    {minutes !== null && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {t('minutes', { minutes })}
                      </p>
                    )}
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
