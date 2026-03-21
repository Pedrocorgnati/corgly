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
          ? 'bg-[#FEE2E2] text-[#DC2626] dark:bg-[#4C0519]/30 dark:text-[#FB7185]'
          : isLow
          ? 'bg-[#FEF3C7] text-[#D97706] dark:bg-[#78350F]/30 dark:text-[#FBBF24]'
          : 'bg-[#EEF2FF] text-[#4F46E5] dark:bg-[#312E81]/30 dark:text-[#818CF8]',
        className
      )}
      title={`${balance} crédito${balance !== 1 ? 's' : ''} disponível${balance !== 1 ? 'is' : ''}`}
    >
      {showIcon && <Coins className="h-3.5 w-3.5" />}
      <span>{balance}</span>
    </span>
  );
}
