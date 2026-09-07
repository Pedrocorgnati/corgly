'use client';

import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { SessionStatus, SESSION_STATUS_MAP, SESSION_STATUS_LABEL_KEY } from '@/lib/constants/enums';

interface RescheduleRequestBadgeProps {
  status: string;
}

export function RescheduleRequestBadge({ status }: RescheduleRequestBadgeProps) {
  const t = useTranslations('sessionStatus');
  if (status !== SessionStatus.RESCHEDULE_PENDING) return null;

  const config = SESSION_STATUS_MAP.RESCHEDULE_PENDING;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color} ${config.bg}`}
    >
      <Clock className="h-3 w-3" />
      {t(SESSION_STATUS_LABEL_KEY[SessionStatus.RESCHEDULE_PENDING])}
    </span>
  );
}
