'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AvailabilitySlot } from '@/hooks/useCalendar';
import type { OwnReservedSlot } from '@/actions/sessions';

/**
 * Ate 2026-09-07 os nomes de mes e de dia da semana eram duas constantes de
 * modulo em portugues — fora do alcance do next-intl. Agora saem do `Intl` no
 * idioma do leitor: dicionario nao precisa carregar o que o runtime ja sabe, e
 * um idioma novo passa a funcionar sem catalogo novo.
 *
 * O `Intl` devolve "janeiro"/"dom." em pt-BR; a tela sempre mostrou
 * "Janeiro"/"Dom". `capitalizar` e a ponte entre os dois.
 */
function capitalizar(texto: string): string {
  const limpo = texto.replace(/\.$/, '');
  return limpo.charAt(0).toLocaleUpperCase() + limpo.slice(1);
}

/**
 * Domingo a sabado. 2023-01-01 foi um domingo em UTC; formatar em UTC evita que
 * o fuso do navegador empurre a lista um dia para tras.
 */
function nomesDosDias(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, i) =>
    capitalizar(fmt.format(new Date(Date.UTC(2023, 0, 1 + i)))),
  );
}

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
  /**
   * Horarios que o proprio aluno ja reservou, por dia civil (item 036). Ganham
   * marcador proprio e NUNCA contam como horario disponivel. Opcional: sem a prop
   * (reagendamento, admin) a grade fica como antes, sem a legenda extra.
   */
  ownSlotsByDate?: Record<string, OwnReservedSlot[]>;
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
  ownSlotsByDate,
}: CalendarViewProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo aluno.
  const t = useTranslations('calendar.view');
  const locale = useLocale();

  const weekdays = useMemo(() => nomesDosDias(locale), [locale]);
  const monthLabel = useMemo(
    () =>
      capitalizar(
        new Intl.DateTimeFormat(locale, { month: 'long' }).format(
          new Date(currentYear, currentMonth, 1),
        ),
      ),
    [locale, currentMonth, currentYear],
  );
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }),
    [locale],
  );

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
        <p className="text-destructive font-medium mb-2">{t('loadErrorTitle')}</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        {onRetry && (
          <Button data-testid="calendar-view-error-retry-button" onClick={onRetry} variant="outline">
            {t('retry')}
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
          aria-label={t('prevMonth')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 data-testid="calendar-view-month-label" className="font-semibold text-foreground">
          {monthLabel} {currentYear}
        </h2>
        <button
          data-testid="calendar-view-next-month-button"
          onClick={onNextMonth}
          className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          aria-label={t('nextMonth')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-xs text-muted-foreground font-medium py-2 text-center">
        {weekdays.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div data-testid="calendar-view-grid" className="grid grid-cols-7 gap-1" role="grid" aria-label={t('gridLabel')}>
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} role="gridcell" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dateKey = formatDateKey(day);
          const past = isPast(day);
          const todayMark = isToday(day);
          const ownSlots = ownSlotsByDate?.[dateKey] ?? [];
          const ownIds = new Set(ownSlots.map((slot) => slot.id));
          // So horario LIVRE conta como disponivel: um id que chegue nas duas
          // listas (leituras fora de ordem) e reserva propria, nao oferta.
          const freeCount = (slotsByDate[dateKey] ?? []).filter((slot) => !ownIds.has(slot.id)).length;
          const hasSlots = !past && freeCount > 0;
          const hasOwn = !past && ownSlots.length > 0;
          const isSelected = selectedDate === dateKey;
          // Montado por juncao em vez de uma chave unica com tres buracos: cada
          // pedaco e opcional, e o separador some junto com ele.
          const ariaLabel = [
            todayMark ? t('today') : null,
            dayFormatter.format(new Date(currentYear, currentMonth, day)),
            hasSlots ? t('slotsAvailableShort') : null,
            hasOwn ? t('ownReservedShort') : null,
          ]
            .filter(Boolean)
            .join(', ');

          return (
            <button
              key={day}
              data-testid={`calendar-view-day-${dateKey}`}
              onClick={() => !past && onSelectDate(isSelected ? null : dateKey)}
              disabled={past}
              role="gridcell"
              aria-selected={isSelected}
              aria-label={ariaLabel}
              className={cn(
                'flex flex-col items-center justify-center h-10 w-full rounded-full text-sm transition-colors',
                past && 'text-muted-foreground/40 cursor-not-allowed pointer-events-none',
                !past && !isSelected && 'hover:bg-muted text-foreground',
                todayMark && !isSelected && 'border-2 border-primary text-primary font-semibold',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              <span>{day}</span>
              {(hasSlots || hasOwn) && (
                <span className="flex items-center gap-0.5 mt-0.5">
                  {hasSlots && (
                    <span
                      data-testid={`calendar-view-day-available-${dateKey}`}
                      className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        isSelected ? 'bg-primary-foreground' : 'bg-emerald-500',
                      )}
                    />
                  )}
                  {hasOwn && (
                    <span
                      data-testid={`calendar-view-day-own-${dateKey}`}
                      className={cn(
                        'w-1.5 h-1.5 rounded-full border',
                        isSelected ? 'border-primary-foreground' : 'border-primary',
                      )}
                    />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-center flex items-center justify-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        {t('legend')}
      </p>
      {ownSlotsByDate && (
        <p className="text-xs text-muted-foreground mt-1 text-center flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full border border-primary inline-block" />
          {t('ownLegend')}
        </p>
      )}
    </div>
  );
}
