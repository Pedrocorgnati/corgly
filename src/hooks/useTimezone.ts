'use client';

import { useCallback, useMemo } from 'react';
import { formatDualTimezone } from '@/lib/format-datetime';

// ── Types ──

export interface UseTimezoneReturn {
  studentTz: string;
  adminTz: string;
  formatDualTz: (utcDate: Date) => string;
}

// ── Hook ──

export function useTimezone(studentTz: string, adminTz: string): UseTimezoneReturn {
  const formatDualTz = useCallback(
    (utcDate: Date): string => {
      return formatDualTimezone(utcDate, studentTz, adminTz);
    },
    [studentTz, adminTz],
  );

  return useMemo(
    () => ({
      studentTz,
      adminTz,
      formatDualTz,
    }),
    [studentTz, adminTz, formatDualTz],
  );
}
