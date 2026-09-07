'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAvailability } from '@/actions/sessions';

export interface AvailabilitySlot {
  id: string;
  startAt: string;
  endAt: string;
  isBlocked: boolean;
}

export interface UseCalendarReturn {
  currentMonth: number;
  currentYear: number;
  slots: AvailabilitySlot[];
  slotsByDate: Record<string, AvailabilitySlot[]>;
  isLoading: boolean;
  error: string | null;
  prevMonth: () => void;
  nextMonth: () => void;
  refresh: () => void;
}

export interface UseCalendarOptions {
  /**
   * Quando `false`, o hook nao busca nada e devolve lista vazia sem loading.
   * Serve para quem monta um componente que ja recebe os slots de fora
   * (`AdminCalendar` com a prop `calendar`), sem disparar um fetch publico
   * redundante e sem quebrar a regra dos hooks.
   */
  enabled?: boolean;
}

export function useCalendar(options?: UseCalendarOptions): UseCalendarReturn {
  const enabled = options?.enabled ?? true;
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Falha INESPERADA (excecao dentro do `try`): rede caida, resposta nao
   * serializavel, defeito de codigo. Guardada aqui e relancada durante o
   * render, unico caminho que a error boundary da rota observa - um `throw`
   * dentro da promise de `fetchSlots` viraria unhandled rejection. Interno:
   * `UseCalendarReturn` nao muda.
   */
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const fetchSlots = useCallback(async () => {
    if (!enabled) {
      setSlots([]);
      setError(null);
      setFatalError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setFatalError(null);
    try {
      const result = await getAvailability(monthKey);
      if (result.error) {
        setError(result.error);
        setSlots([]);
      } else {
        setSlots(result.data ?? []);
      }
    } catch (err) {
      // Nao vira `error` inline: a string generica passa a ser exclusiva do que
      // o servidor devolve em `result.error` (falha esperada, recuperavel).
      setFatalError(err instanceof Error ? err : new Error(String(err)));
      setSlots([]);
    } finally {
      setIsLoading(false);
    }
  }, [monthKey, enabled]);

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

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

  // Relance durante o render: e o que faz o `error.tsx` da rota montar.
  if (fatalError) throw fatalError;

  return {
    currentMonth,
    currentYear,
    slots,
    slotsByDate,
    isLoading,
    error,
    prevMonth,
    nextMonth,
    refresh: fetchSlots,
  };
}
