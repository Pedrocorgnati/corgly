import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreditBadgeProps {
  balance: number;
  className?: string;
  showIcon?: boolean;
}

export function CreditBadge({ balance, className, showIcon = true }: CreditBadgeProps) {
  const isLow = balance <= 2;
  const isEmpty = balance === 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
        isEmpty
          ? 'bg-destructive/10 text-destructive'
          : isLow
          ? 'bg-warning/10 text-warning'
          : 'bg-primary/10 text-primary',
        className
      )}
      title={`${balance} crédito${balance !== 1 ? 's' : ''} disponível${balance !== 1 ? 'is' : ''}`}
    >
      {showIcon && <Coins className="h-3.5 w-3.5" />}
      <span>{balance}</span>
    </span>
  );
}
