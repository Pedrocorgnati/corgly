'use client';

import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <div className={cn('bg-card border border-border rounded-2xl p-6 shadow-sm', className)}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-foreground">{title}</h2>
        {onRetry && !loading && (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Atualizar"
            className="text-muted-foreground hover:text-foreground transition"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3" data-testid="metric-skeleton">
          <div className="h-8 w-1/2 bg-muted rounded" />
          <div className="h-4 w-3/4 bg-muted rounded" />
          <div className="h-4 w-2/3 bg-muted rounded" />
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">
          {error}
          {onRetry && (
            <button type="button" onClick={onRetry} className="ml-2 underline">
              Tentar novamente
            </button>
          )}
        </div>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">Sem dados no periodo selecionado.</p>
      ) : (
        children
      )}
    </div>
  );
}
