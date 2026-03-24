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

export function useCalendar(): UseCalendarReturn {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const fetchSlots = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAvailability(monthKey);
      if (result.error) {
        setError(result.error);
        setSlots([]);
      } else {
        setSlots(result.data ?? []);
      }
    } catch {
      setError('Erro ao carregar horários.');
      setSlots([]);
    } finally {
      setIsLoading(false);
    }
  }, [monthKey]);

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
