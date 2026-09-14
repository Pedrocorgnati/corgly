'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOwnReservedSlots, type OwnReservedSlot } from '@/actions/sessions';
import { toDateKey } from '@/lib/civil-date-key';

export interface UseOwnReservationsOptions {
  /** Mes exibido, base 0: o mesmo `currentMonth` devolvido por `useCalendar`. */
  currentMonth: number;
  currentYear: number;
  /** Fuso IANA do aluno. Agrupa no mesmo dia civil dos horarios livres. */
  timeZone?: string;
}

export interface UseOwnReservationsReturn {
  ownSlots: OwnReservedSlot[];
  ownSlotsByDate: Record<string, OwnReservedSlot[]>;
  refresh: () => void;
}

interface LoadedReservations {
  monthKey: string;
  slots: OwnReservedSlot[];
}

const NO_SLOTS: OwnReservedSlot[] = [];

/**
 * Horarios que o proprio aluno ja reservou no mes exibido (item 036).
 *
 * Leitura AUTENTICADA, separada da disponibilidade publica: a rota publica exclui
 * todo horario ocupado e nao pode ganhar dado de sessao. Falha aqui (erro devolvido
 * ou excecao) resulta em lista vazia e nunca e relancada: a agenda so deixa de
 * identificar as reservas, e nenhum horario proprio passa a ser oferecido como
 * livre, porque a lista livre vem da outra leitura e ja o exclui.
 */
export function useOwnReservations({
  currentMonth,
  currentYear,
  timeZone,
}: UseOwnReservationsOptions): UseOwnReservationsReturn {
  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const [loaded, setLoaded] = useState<LoadedReservations | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let ativo = true;
    // `Promise.resolve().then` tambem absorve excecao sincrona da chamada. O
    // estado so muda no callback da resposta, e resposta de leitura substituida
    // (troca de mes, refresh) e descartada.
    Promise.resolve()
      .then(() => getOwnReservedSlots(monthKey))
      .then(
        (result) => (result.error ? [] : (result.data ?? [])),
        (): OwnReservedSlot[] => [],
      )
      .then((slots) => {
        if (ativo) setLoaded({ monthKey, slots });
      });
    return () => {
      ativo = false;
    };
  }, [monthKey, reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  // Resposta de outro mes (troca de mes com a leitura em voo) nao vale para a
  // grade atual.
  const ownSlots = loaded?.monthKey === monthKey ? loaded.slots : NO_SLOTS;

  const ownSlotsByDate = useMemo(() => {
    const map: Record<string, OwnReservedSlot[]> = {};
    for (const slot of ownSlots) {
      const dateKey = toDateKey(slot.startAt, timeZone);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(slot);
    }
    return map;
  }, [ownSlots, timeZone]);

  return { ownSlots, ownSlotsByDate, refresh };
}
