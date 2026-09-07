import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { SessionStatus } from '@/lib/constants/enums';
import { SESSION_STATUS_MAP, SESSION_STATUS_LABEL_KEY } from '@/lib/constants/enums';

interface StatusBadgeProps {
  status: SessionStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const t = useTranslations('sessionStatus');
  const config = SESSION_STATUS_MAP[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        config.color,
        config.bg,
        className
      )}
    >
      {t(SESSION_STATUS_LABEL_KEY[status])}
    </span>
  );
}
