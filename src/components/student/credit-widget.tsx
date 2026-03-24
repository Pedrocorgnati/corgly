'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

interface CreditWidgetProps {
  balance: number;
  expiringCount?: number;
  expiringDays?: number;
}

export function CreditWidget({ balance, expiringCount = 0, expiringDays = 0 }: CreditWidgetProps) {
  const isEmpty = balance === 0;
  const isExpiring = expiringCount > 0;

  return (
    <div className={cn(
      'bg-card border rounded-xl p-5 shadow-sm',
      isEmpty
        ? 'border-2 border-destructive'
        : isExpiring
          ? 'border-2 border-warning'
          : 'border-border border-l-4 border-l-success',
    )}>
      <p className="text-sm font-medium text-muted-foreground mb-3">Créditos Corgly</p>
      <div className="text-center mb-4">
        <p className={cn('text-4xl font-bold', isEmpty ? 'text-destructive' : 'text-foreground')}>
          {balance}
        </p>
        <p className="text-sm text-muted-foreground">créditos</p>
      </div>

      {expiringCount > 0 && (
        <div className="mb-4 border-l-4 border-warning bg-amber-50 dark:bg-amber-950/20 p-3 rounded-r-lg">
          <p className="text-sm text-warning font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            {expiringCount} crédito{expiringCount > 1 ? 's' : ''} expira{expiringCount > 1 ? 'm' : ''} em {expiringDays} dia{expiringDays > 1 ? 's' : ''}
          </p>
        </div>
      )}

      <Link
        href={ROUTES.CREDITS}
        className={cn(
          buttonVariants({ variant: isEmpty ? 'default' : 'outline' }),
          'w-full',
          !isEmpty && 'border-primary text-primary hover:bg-primary/5',
        )}
      >
        {isEmpty ? 'Comprar créditos' : 'Comprar mais'}
      </Link>
    </div>
  );
}
