'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAdminAvailability } from '@/actions/sessions';
import type { AvailabilitySlot, UseCalendarReturn } from '@/hooks/useCalendar';

export interface AdminScheduleSession {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  studentName?: string;
  availabilitySlotId?: string;
}

export interface UseAdminScheduleReturn extends UseCalendarReturn {
  sessions: AdminScheduleSession[];
}

interface AdminSlotDTO {
  id: string;
  startAt: string;
  endAt: string;
  isBlocked: boolean;
  session: { id: string; status: string; studentName?: string } | null;
}

/**
 * Fonte unica da agenda do professor: usa a rota admin, que devolve TODOS os
 * slots da janela (livres, bloqueados e vendidos) com a sessao ocupante.
 * Alimenta ao mesmo tempo o `AdminCalendar` (via `UseCalendarReturn` +
 * `sessions`) e o `AvailabilityEditor` (via `slots` como `existingSlots`),
 * de modo que um unico `refresh` re-busca as duas coisas.
 */
export function useAdminSchedule(): UseAdminScheduleReturn {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [adminSlots, setAdminSlots] = useState<AdminSlotDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Gemeo do `fatalError` de `useCalendar`: falha INESPERADA guardada para ser
   * relancada durante o render. Este e o unico caminho pelo qual o `error.tsx`
   * da rota admin chega a montar, porque na agenda do professor o `useCalendar`
   * roda com `enabled: false` e nunca busca nada.
   */
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const fetchSlots = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setFatalError(null);
    try {
      const result = await getAdminAvailability(monthKey);
      if (result.error) {
        setError(result.error);
        setAdminSlots([]);
      } else {
        setAdminSlots(result.data ?? []);
      }
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
      setAdminSlots([]);
    } finally {
      setIsLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

  const slots = useMemo<AvailabilitySlot[]>(
    () =>
      adminSlots.map((s) => ({
        id: s.id,
        startAt: s.startAt,
        endAt: s.endAt,
        isBlocked: s.isBlocked,
      })),
    [adminSlots],
  );

  // `startAt` vem do SLOT, nao da sessao: `AdminCalendar` chaveia
  // `sessionBySlotTime` por `slot.startAt`.
  const sessions = useMemo<AdminScheduleSession[]>(
    () =>
      adminSlots
        .filter((s): s is AdminSlotDTO & { session: NonNullable<AdminSlotDTO['session']> } => s.session !== null)
        .map((s) => ({
          id: s.session.id,
          startAt: s.startAt,
          endAt: s.endAt,
          status: s.session.status,
          studentName: s.session.studentName,
          availabilitySlotId: s.id,
        })),
    [adminSlots],
  );

  const slotsByDate = useMemo(() => {
    const map: Record<string, AvailabilitySlot[]> = {};
    for (const slot of slots) {
      const dateKey = slot.startAt.slice(0, 10);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(slot);
    }
    return map;
  }, [slots]);

  const prevMonth = useCallback(() => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }, [currentMonth]);

  const nextMonth = useCallback(() => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }, [currentMonth]);

  // Relance durante o render: e o que faz o `error.tsx` da rota admin montar.
  if (fatalError) throw fatalError;

  return {
    currentMonth,
    currentYear,
    slots,
    slotsByDate,
    sessions,
    isLoading,
    error,
    prevMonth,
    nextMonth,
    refresh: fetchSlots,
  };
}
