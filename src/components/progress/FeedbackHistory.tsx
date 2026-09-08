'use client';
import { PAGINATION } from '@/lib/constants';
import { API } from '@/lib/constants/routes';

import { useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, Download, ChevronLeft, ChevronRight, Loader2, ClipboardList } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button, buttonVariants } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

/**
 * Vocabulario canonico das notas por dimensao. Fonte da verdade:
 * prisma/schema.prisma (listeningScore/speakingScore/writingScore/vocabularyScore),
 * src/schemas/feedback.schema.ts e src/services/feedback.service.ts (mapFeedback).
 */
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

/**
 * Ate 2026-09-07 o rotulo de cada periodo e o nome de cada dimensao moravam aqui
 * em portugues cravado, fora do alcance do next-intl. Sobrou o que nao tem
 * idioma: o valor do filtro e a chave da dimensao, que ja indexa o catalogo.
 */
const PERIOD_OPTIONS: Array<{ value: Period; messageKey: string }> = [
  { value: '30d', messageKey: 'history.period30d' },
  { value: '90d', messageKey: 'history.period90d' },
  { value: 'all', messageKey: 'history.periodAll' },
];

const DIMENSION_KEYS: (keyof FeedbackScores)[] = ['listening', 'speaking', 'writing', 'vocabulary'];

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Nota ausente ou nao-finita vira travessao — nunca `NaN` nem TypeError. */
function formatScore(value: unknown): string {
  return isScore(value) ? value.toFixed(1) : '—';
}

function scoreBadgeClass(score: unknown): string {
  if (!isScore(score)) return 'bg-muted text-muted-foreground';
  if (score <= 2) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (score <= 3.4) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
}

// Ate 2026-09-07 a data saia sempre em 'pt-BR', mesmo para quem tinha escolhido
// outro idioma.
function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function FeedbackHistory({ initialData }: FeedbackHistoryProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo aluno — inclusive as duas mensagens de falha do filtro.
  const t = useTranslations('progress');
  const locale = useLocale();
  const [data, setData] = useState<HistoryData>(initialData);
  const [period, setPeriod] = useState<Period>('all');
  const [currentPage, setCurrentPage] = useState(initialData.page);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const limit = data.limit > 0 ? data.limit : PAGINATION.FEEDBACK_HISTORY;
  const totalPages = Math.max(1, Math.ceil(data.total / limit));

  const fetchData = useCallback(async (page: number, p: Period) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const json = await apiClient.get<{ data: HistoryData }>(API.FEEDBACK_HISTORY, { params: { page, limit: PAGINATION.FEEDBACK_HISTORY, period: p } });
      if (json.data) {
        setData(json.data);
        setCurrentPage(page);
      } else {
        // Zero Silencio: resposta sem `data` nao pode passar como sucesso.
        setLoadError(t('history.badFormat'));
      }
    } catch (error) {
      // Zero Silencio: os dados antigos continuam na tela, mas o usuario ve
      // que o filtro/pagina que ele pediu nao foi aplicado.
      setLoadError(
        error instanceof Error
          ? t('history.refreshFailedDetail', { message: error.message })
          : t('history.refreshFailed'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [t]);

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
    <div data-testid="progress-feedback-history" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="font-semibold text-foreground">{t('history.title')}</h2>

        <div className="flex items-center gap-3">
          {/* Period filter */}
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                data-testid={`progress-feedback-history-period-${opt.value}-button`}
                onClick={() => handlePeriodChange(opt.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === opt.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(opt.messageKey)}
              </button>
            ))}
          </div>

          {/* CSV export */}
          <a
            data-testid="progress-feedback-history-export-button"
            href={`/api/v1/feedback/history?format=csv&period=${period}`}
            download
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Download className="w-3.5 h-3.5" />
            {t('history.export')}
          </a>
        </div>
      </div>

      {loadError && (
        <div
          data-testid="progress-feedback-history-error"
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" aria-hidden="true" />
          <p className="text-xs text-foreground">{loadError}</p>
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          data-testid="progress-feedback-history-empty"
          icon={ClipboardList}
          title={t('history.empty')}
          description={t('history.emptyDesc')}
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
              <table data-testid="progress-feedback-history-table" className="w-full text-sm">
                <caption className="sr-only">{t('history.tableCaption')}</caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-3 font-medium">{t('history.columnDate')}</th>
                    {DIMENSION_KEYS.map((key) => (
                      <th key={key} className="pb-3 font-medium text-center">
                        {t(`dimensions.${key}`)}
                      </th>
                    ))}
                    <th className="pb-3 font-medium text-center">{t('history.columnAverage')}</th>
                    <th className="pb-3 font-medium">{t('history.columnComment')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} data-testid={`progress-feedback-history-row-${item.id}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 text-foreground">{formatDate(item.sessionDate, locale)}</td>
                      {DIMENSION_KEYS.map((key) => (
                        <td key={key} className="py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${scoreBadgeClass(item.scores[key])}`}>
                            {formatScore(item.scores[key])}
                          </span>
                        </td>
                      ))}
                      <td className="py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${scoreBadgeClass(item.averageScore)}`}>
                          {formatScore(item.averageScore)}
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
                <div key={item.id} data-testid={`progress-feedback-history-row-${item.id}-mobile`} className="border border-border rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {formatDate(item.sessionDate, locale)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${scoreBadgeClass(item.averageScore)}`}>
                      {t('history.average')}: {formatScore(item.averageScore)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DIMENSION_KEYS.map((key) => (
                      <div key={key} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{t(`dimensions.${key}`)}</span>
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${scoreBadgeClass(item.scores[key])}`}>
                          {formatScore(item.scores[key])}
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
            <div data-testid="progress-feedback-history-pagination" className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {t('history.pageInfo', {
                  page: currentPage,
                  totalPages,
                  total: data.total,
                })}
              </p>
              <div className="flex gap-2">
                <Button
                  data-testid="progress-feedback-history-prev-button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                  aria-label={t('history.prevAria')}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  {t('history.prev')}
                </Button>
                <Button
                  data-testid="progress-feedback-history-next-button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || isLoading}
                  aria-label={t('history.nextAria')}
                >
                  {t('history.next')}
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
