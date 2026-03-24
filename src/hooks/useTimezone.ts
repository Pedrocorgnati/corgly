'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { formatDualTimezone } from '@/lib/format-datetime';

// ── Constants ──

const ADMIN_TIMEZONE = 'America/Sao_Paulo';

// ── Types ──

export interface UseTimezoneReturn {
  studentTz: string;
  adminTz: string;
  formatDualTz: (utcDate: Date) => string;
  detectTimezone: () => string;
}

// ── Hook ──

export function useTimezone(): UseTimezoneReturn {
  const detectTimezone = useCallback((): string => {
    if (typeof window === 'undefined') return ADMIN_TIMEZONE;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return ADMIN_TIMEZONE;
    }
  }, []);

  const [studentTz, setStudentTz] = useState(ADMIN_TIMEZONE);

  useEffect(() => {
    setStudentTz(detectTimezone());
  }, [detectTimezone]);

  const formatDualTz = useCallback(
    (utcDate: Date): string => {
      return formatDualTimezone(utcDate, studentTz, ADMIN_TIMEZONE);
    },
    [studentTz],
  );

  return useMemo(
    () => ({
      studentTz,
      adminTz: ADMIN_TIMEZONE,
      formatDualTz,
      detectTimezone,
    }),
    [studentTz, formatDualTz, detectTimezone],
  );
}
