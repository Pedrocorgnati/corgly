'use client';

import { RefreshCw } from 'lucide-react';
import { WidgetCard } from '@/components/shared/widget-card';

interface MetricCardShellProps {
  title:    string;
  loading:  boolean;
  error:    string | null;
  empty?:   boolean;
  onRetry?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function MetricCardShell({ title, loading, error, empty, onRetry, children, className }: MetricCardShellProps) {
  return (
    <WidgetCard
      title={title}
      className={className}
      action={
        onRetry && !loading ? (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Atualizar"
            className="text-muted-foreground hover:text-brand-500 transition"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="animate-pulse space-y-3" data-testid="metric-skeleton">
          <div className="h-8 w-1/2 bg-muted rounded" />
          <div className="h-4 w-3/4 bg-muted rounded" />
          <div className="h-4 w-2/3 bg-muted rounded" />
        </div>
      ) : error ? (
        <div className="text-[13.5px] text-destructive">
          {error}
          {onRetry && (
            <button type="button" onClick={onRetry} className="ml-2 underline">
              Tentar novamente
            </button>
          )}
        </div>
      ) : empty ? (
        <p className="text-[13.5px] text-muted-foreground">Sem dados no periodo selecionado.</p>
      ) : (
        children
      )}
    </WidgetCard>
  );
}
