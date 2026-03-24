'use client';
import { PAGINATION } from '@/lib/constants';
import { API } from '@/lib/constants/routes';

import { useState, useCallback } from 'react';
import { Download, ChevronLeft, ChevronRight, Loader2, ClipboardList } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button, buttonVariants } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

interface FeedbackScores {
  listening: number;
  speaking: number;
  writing: number;
  vocabulary: number;
}

interface HistoryItem {
  id: string;
  sessionDate: string;
  scores: FeedbackScores;
  overallFeedback?: string | null;
  averageScore: number;
  sessionId: string;
}

interface HistoryData {
  items: HistoryItem[];
  total: number;
  page: number;
  limit: number;
}

interface FeedbackHistoryProps {
  initialData: HistoryData;
}

type Period = '30d' | '90d' | 'all';

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: '30d', label: 'Ultimo mes' },
  { value: '90d', label: 'Ultimos 3 meses' },
  { value: 'all', label: 'Todas' },
];

const DIMENSION_LABELS: Record<keyof FeedbackScores, string> = {
  listening:  'Escuta',
  speaking:   'Fala',
  writing:    'Escrita',
  vocabulary: 'Vocabulário',
};

function scoreBadgeClass(score: number): string {
  if (score <= 2) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (score <= 3.4) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function FeedbackHistory({ initialData }: FeedbackHistoryProps) {
  const [data, setData] = useState<HistoryData>(initialData);
  const [period, setPeriod] = useState<Period>('all');
  const [currentPage, setCurrentPage] = useState(initialData.page);
  const [isLoading, setIsLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  const fetchData = useCallback(async (page: number, p: Period) => {
    setIsLoading(true);
    try {
      const json = await apiClient.get<{ data: HistoryData }>(API.FEEDBACK_HISTORY, { params: { page, limit: PAGINATION.FEEDBACK_HISTORY, period: p } });
      if (json.data) {
        setData(json.data);
        setCurrentPage(page);
      }
    } catch {
      // Keep old data visible on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  function handlePeriodChange(p: Period) {
    setPeriod(p);
    fetchData(1, p);
  }

  function handlePageChange(page: number) {
    if (page < 1 || page > totalPages) return;
    fetchData(page, period);
  }

  const isEmpty = data.items.length === 0 && !isLoading;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="font-semibold text-foreground">Historico de Avaliacoes</h2>

        <div className="flex items-center gap-3">
          {/* Period filter */}
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handlePeriodChange(opt.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === opt.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* CSV export */}
          <a
            href={`/api/v1/feedback/history?format=csv&period=${period}`}
            download
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </a>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={ClipboardList}
          title="Sem avaliacoes"
          description="Voce ainda nao tem avaliacoes registradas"
        />
      ) : (
        <>
          {/* Loading overlay */}
          <div className={`relative ${isLoading ? 'opacity-60' : ''}`}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Historico de avaliacoes</caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-3 font-medium">Data</th>
                    {(Object.keys(DIMENSION_LABELS) as (keyof FeedbackScores)[]).map((key) => (
                      <th key={key} className="pb-3 font-medium text-center">
                        {DIMENSION_LABELS[key]}
                      </th>
                    ))}
                    <th className="pb-3 font-medium text-center">Media</th>
                    <th className="pb-3 font-medium">Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 text-foreground">{formatDate(item.sessionDate)}</td>
                      {(Object.keys(DIMENSION_LABELS) as (keyof FeedbackScores)[]).map((key) => (
                        <td key={key} className="py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${scoreBadgeClass(item.scores[key])}`}>
                            {item.scores[key].toFixed(1)}
                          </span>
                        </td>
                      ))}
                      <td className="py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${scoreBadgeClass(item.averageScore)}`}>
                          {item.averageScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-3 text-muted-foreground max-w-[200px] truncate">
                        {item.overallFeedback || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {data.items.map((item) => (
                <div key={item.id} className="border border-border rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {formatDate(item.sessionDate)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${scoreBadgeClass(item.averageScore)}`}>
                      Media: {item.averageScore.toFixed(1)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(DIMENSION_LABELS) as (keyof FeedbackScores)[]).map((key) => (
                      <div key={key} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{DIMENSION_LABELS[key]}</span>
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${scoreBadgeClass(item.scores[key])}`}>
                          {item.scores[key].toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {item.overallFeedback && (
                    <p className="text-xs text-muted-foreground border-t border-border pt-2">
                      {item.overallFeedback}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Pagina {currentPage} de {totalPages} ({data.total} avaliacoes)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                  aria-label="Pagina anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || isLoading}
                  aria-label="Proxima pagina"
                >
                  Proxima
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
