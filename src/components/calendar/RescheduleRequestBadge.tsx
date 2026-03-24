'use client';

import { Clock } from 'lucide-react';
import { SessionStatus, SESSION_STATUS_MAP } from '@/lib/constants/enums';

interface RescheduleRequestBadgeProps {
  status: string;
}

export function RescheduleRequestBadge({ status }: RescheduleRequestBadgeProps) {
  if (status !== SessionStatus.RESCHEDULE_PENDING) return null;

  const config = SESSION_STATUS_MAP.RESCHEDULE_PENDING;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color} ${config.bg}`}
    >
      <Clock className="h-3 w-3" />
      {config.label}
    </span>
  );
}
