'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAvailability } from '@/actions/sessions';
import { getCivilDateParts, toDateKey } from '@/lib/civil-date-key';

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
  /** Fuso IANA usado para transformar cada instante UTC em dia civil. */
  timeZone?: string;
}

/** Maior atraso aceito pelo `setTimeout` (2^31 - 1 ms). */
const MAX_TIMEOUT_MS = 2_147_483_647;

export function useCalendar(options?: UseCalendarOptions): UseCalendarReturn {
  const enabled = options?.enabled ?? true;
  const timeZone = options?.timeZone;
  const today = getCivilDateParts(new Date(), timeZone);
  const [currentMonth, setCurrentMonth] = useState(today.month - 1);
  const [currentYear, setCurrentYear] = useState(today.year);
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
      const result = await getAvailability(monthKey, timeZone);
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
  }, [monthKey, enabled, timeZone]);

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

  /**
   * O corte de `getAvailability` vale so no instante da resposta. Com a tela
   * aberta, um horario carregado como futuro passaria e continuaria listado e
   * clicavel ate o proximo fetch. `now` avanca sozinho no vencimento do proximo
   * slot, e a lista devolvida nunca contem horario com `startAt <= agora`.
   */
  const [now, setNow] = useState(() => Date.now());
  const upcomingSlots = useMemo(
    () => slots.filter((slot) => new Date(slot.startAt).getTime() > now),
    [slots, now],
  );

  useEffect(() => {
    if (upcomingSlots.length === 0) return;
    const nextStart = Math.min(
      ...upcomingSlots.map((slot) => new Date(slot.startAt).getTime()),
    );
    // Teto do setTimeout (~24,8 dias): acima disso o timer dispara antes e reagenda.
    const delay = Math.min(Math.max(nextStart - Date.now(), 0), MAX_TIMEOUT_MS);
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [upcomingSlots]);

  const slotsByDate = useMemo(() => {
    const map: Record<string, AvailabilitySlot[]> = {};
    for (const slot of upcomingSlots) {
      const dateKey = toDateKey(slot.startAt, timeZone);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(slot);
    }
    return map;
  }, [upcomingSlots, timeZone]);

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
    slots: upcomingSlots,
    slotsByDate,
    isLoading,
    error,
    prevMonth,
    nextMonth,
    refresh: fetchSlots,
  };
}
