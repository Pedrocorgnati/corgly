import { Coins } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface CreditBadgeProps {
  balance: number;
  className?: string;
  showIcon?: boolean;
  'data-testid'?: string;
}

export function CreditBadge({ balance, className, showIcon = true, 'data-testid': testId }: CreditBadgeProps) {
  // Ate 2026-09-07 este title era portugues cravado e ignorava o idioma escolhido
  // pelo aluno — inclusive a pluralizacao, que era montada com concatenacao de 's'
  // e 'is'. Agora o plural vem do ICU do catalogo, que cada idioma resolve sozinho.
  const t = useTranslations('creditBadge');
  const isLow = balance <= 2;
  const isEmpty = balance === 0;

  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
        isEmpty
          ? 'bg-destructive/10 text-destructive'
          : isLow
          ? 'bg-warning/10 text-warning'
          : 'bg-primary/10 text-primary',
        className
      )}
      title={t('title', { count: balance })}
    >
      {showIcon && <Coins className="h-3.5 w-3.5" />}
      <span>{balance}</span>
    </span>
  );
}
