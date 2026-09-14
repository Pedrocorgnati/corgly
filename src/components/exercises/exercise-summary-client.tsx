'use client';

/**
 * Componente de resumo da tentativa de exercicio.
 *
 * Reutiliza a estrutura visual do `exercise-summary` existente no DrillShell
 * com papel de status, regiao viva polida (lista revisavel em accordion) e
 * CTA de retorno. A copy vem de `exercises.summaryScore`.
 *
 * Usado na pagina de resumo pos-finalizacao e pode ser reutilizado pelo
 * professor para ver resultados de alunos (Fase 2).
 */

import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { API, ROUTES } from '@/lib/constants/routes';
import {
  EXERCISE_ITEM_SCHEMAS_BY_KIND,
  OPTION_LETTERS,
  type ExerciseItemKind,
} from '@/lib/exercises';
import { EXERCISE_ANSWER_SCHEMAS_BY_KIND } from '@/schemas/exercise.schema';
import { cn } from '@/lib/utils';

export interface SummaryItem {
  id: string;
  kind: ExerciseItemKind;
  position: number;
  payload: unknown;
  answerKey: unknown | null;
  userAnswer: unknown;
  isCorrect: boolean | null;
}

export interface AttemptSummary {
  attemptId: string;
  exerciseId: string;
  exerciseTitle: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  answeredCount: number;
  correctCount: number;
  itemCount: number;
  score: number | null;
  scorePercent: number | null;
  finishedAt: string | null;
  items: SummaryItem[];
}

interface ExerciseSummaryClientProps {
  summary: AttemptSummary;
  onRetry?: () => void | Promise<void>;
}

type RetryState = 'idle' | 'submitting' | 'error';

export function ExerciseSummaryClient({
  summary,
  onRetry,
}: ExerciseSummaryClientProps) {
  const t = useTranslations('exercises');
  const router = useRouter();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [retryState, setRetryState] = useState<RetryState>('idle');

  const isCompleted = summary.status === 'COMPLETED';
  const isInProgress = summary.status === 'IN_PROGRESS';

  const toggleItem = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBack = () => {
    router.push(ROUTES.EXERCISES);
  };

  const handleRetry = async () => {
    if (!isCompleted || retryState === 'submitting') return;

    setRetryState('submitting');
    try {
      if (onRetry) {
        await onRetry();
      } else {
        const response = await fetch(API.EXERCISES.ATTEMPTS(summary.exerciseId), {
          method: 'POST',
          credentials: 'include',
        });
        const body = (await response.json().catch(() => null)) as {
          data?: { attempt?: { id?: string } };
        } | null;
        if (!response.ok || !body?.data?.attempt?.id) {
          throw new Error('Falha ao iniciar nova tentativa.');
        }
        router.push(ROUTES.EXERCISE(summary.exerciseId));
      }
      setRetryState('idle');
    } catch {
      setRetryState('error');
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header com titulo e status */}
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">{summary.exerciseTitle}</h1>
        <div className="mt-2 flex items-center justify-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              isCompleted && 'border-success/30 bg-success/10 text-success',
              isInProgress && 'border-primary/30 bg-primary/10 text-primary',
              !isCompleted && !isInProgress &&
                'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            {isCompleted
              ? t('statusCompleted')
              : isInProgress
                ? t('statusInProgress')
                : t('statusAbandoned')}
          </Badge>
        </div>
      </div>

      {/* Bloco de score */}
      <div
        data-testid="exercise-summary"
        role="status"
        aria-live="polite"
        className="mb-6 rounded-xl border border-border bg-muted/40 p-6 text-center"
      >
        <p className="text-base font-semibold text-foreground">{t('summaryTitle')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('summaryScore', { correct: summary.correctCount, total: summary.answeredCount })}
        </p>
        {isCompleted && summary.scorePercent !== null && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('summaryPercentage', { percent: summary.scorePercent })}
          </p>
        )}
      </div>

      {/* Lista revisavel de itens */}
      <div className="mb-6 space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('summaryItems')}</h2>
        <div className="space-y-2">
          {summary.items.map((item) => {
            const isExpanded = expandedItems.has(item.id);
            const hasAnswer = item.userAnswer !== null;
            const state = !hasAnswer
              ? 'notAnswered'
              : item.isCorrect
                ? 'correct'
                : 'incorrect';

            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border bg-card p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`item-trigger-${item.position}`}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {t('itemNumber', { number: item.position })}
                    </span>
                    <span className="text-xs text-muted-foreground">{itemKindLabel(item.kind, t)}</span>
                    <span
                      data-testid={`item-state-${item.position}`}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-medium',
                        state === 'correct' && 'text-success',
                        state === 'incorrect' && 'text-destructive',
                        state === 'notAnswered' && 'text-muted-foreground',
                      )}
                    >
                      {state === 'correct' ? (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      ) : state === 'incorrect' ? (
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <CircleHelp className="h-4 w-4" aria-hidden="true" />
                      )}
                      {state === 'correct'
                        ? t('answerStateCorrect')
                        : state === 'incorrect'
                          ? t('answerStateIncorrect')
                          : t('answerStateNotAnswered')}
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      isExpanded && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </button>
                {isExpanded && (
                  <div className="rounded-b-lg border-x border-b border-border bg-card/50 p-3">
                    {renderItemDetail(item, t)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CTAs */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={handleBack} variant="outline" className="min-h-11 min-w-11">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('backToExercises')}
        </Button>
        {isCompleted && (
          <Button
            onClick={() => void handleRetry()}
            className="min-h-11 min-w-11"
            disabled={retryState === 'submitting'}
            aria-busy={retryState === 'submitting'}
          >
            {retryState === 'submitting' && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('retryButton')}
          </Button>
        )}
      </div>
      {retryState === 'error' && (
        <p className="mt-3 text-center text-sm text-destructive" role="alert">
          {t('summaryRetryError')}
        </p>
      )}
    </div>
  );
}

type ExercisesTranslator = ReturnType<typeof useTranslations<'exercises'>>;

function itemKindLabel(kind: ExerciseItemKind, t: ExercisesTranslator): string {
  switch (kind) {
    case 'MULTIPLE_CHOICE':
      return t('kindMultipleChoice');
    case 'MATCH_CLICK':
      return t('kindMatchClick');
    case 'AUDIO_WORD':
      return t('kindAudioWord');
    case 'AUDIO_CLOZE':
      return t('kindAudioCloze');
    case 'AUDIO_SENTENCE':
      return t('kindAudioSentence');
    case 'AUDIO_CHOICE':
      return t('kindAudioChoice');
    case 'AUDIO_ORDER':
      return t('kindAudioOrder');
    case 'TEXT_CHOICE':
      return t('kindTextChoice');
    case 'VERB_CLOZE':
      return t('kindVerbCloze');
    case 'IMAGE_WORD':
      return t('kindImageWord');
    case 'IMAGE_CHOICE':
      return t('kindImageChoice');
    case 'IMAGE_SPEAK':
      return t('kindImageSpeak');
    case 'AUDIO_SHADOW':
      return t('kindAudioShadow');
    case 'L1_SPEAK_PT':
      return t('kindL1SpeakPt');
    default: {
      const exhaustive: never = kind;
      return String(exhaustive);
    }
  }
}

function renderChoiceDetail(
  payload: { prompt: string; options: readonly string[]; readingText?: string },
  correctIndex: number | null,
  selectedIndex: number | null,
  t: ExercisesTranslator,
) {
  return (
    <div className="space-y-3 text-sm">
      {payload.readingText && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('readingTextLabel')}</p>
          <p className="mt-1 whitespace-pre-wrap text-foreground">{payload.readingText}</p>
        </div>
      )}
      <p className="font-medium text-foreground">{payload.prompt}</p>
      <ul className="space-y-1">
        {payload.options.map((option, index) => {
          const isCorrectAnswer = correctIndex === index;
          const isUserAnswer = selectedIndex === index;
          return (
            <li
              key={`${index}-${option}`}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1',
                isCorrectAnswer && 'bg-success/10 font-medium text-success',
                isUserAnswer && !isCorrectAnswer &&
                  'bg-destructive/10 text-destructive line-through',
                !isCorrectAnswer && !isUserAnswer && 'text-muted-foreground',
              )}
            >
              <span>{OPTION_LETTERS[index]}.</span>
              <span className="min-w-0 flex-1">{option}</span>
              {isCorrectAnswer && (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="sr-only">{t('correctAnswerLabel')}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {selectedIndex === null && (
        <p className="text-muted-foreground">{t('answerStateNotAnswered')}</p>
      )}
    </div>
  );
}

function renderItemDetail(item: SummaryItem, t: ExercisesTranslator) {
  switch (item.kind) {
    case 'MULTIPLE_CHOICE': {
      const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.MULTIPLE_CHOICE.payload.safeParse(item.payload);
      const answerKey = item.answerKey === null
        ? null
        : EXERCISE_ITEM_SCHEMAS_BY_KIND.MULTIPLE_CHOICE.answerKey.safeParse(item.answerKey);
      const userAnswer = item.userAnswer === null
        ? null
        : EXERCISE_ANSWER_SCHEMAS_BY_KIND.MULTIPLE_CHOICE.safeParse(item.userAnswer);

      if (!payload.success || (answerKey !== null && !answerKey.success)) {
        return <p className="text-sm text-destructive">{t('summaryInvalidItem')}</p>;
      }

      return renderChoiceDetail(
        payload.data,
        answerKey?.data.correctIndex ?? null,
        userAnswer?.success ? userAnswer.data.selectedIndex : null,
        t,
      );
    }
    case 'TEXT_CHOICE': {
      const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.TEXT_CHOICE.payload.safeParse(item.payload);
      const answerKey = item.answerKey === null
        ? null
        : EXERCISE_ITEM_SCHEMAS_BY_KIND.TEXT_CHOICE.answerKey.safeParse(item.answerKey);
      const userAnswer = item.userAnswer === null
        ? null
        : EXERCISE_ANSWER_SCHEMAS_BY_KIND.TEXT_CHOICE.safeParse(item.userAnswer);

      if (!payload.success || (answerKey !== null && !answerKey.success)) {
        return <p className="text-sm text-destructive">{t('summaryInvalidItem')}</p>;
      }

      return renderChoiceDetail(
        payload.data,
        answerKey?.data.correctIndex ?? null,
        userAnswer?.success ? userAnswer.data.selectedIndex : null,
        t,
      );
    }
    case 'MATCH_CLICK': {
      const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.MATCH_CLICK.payload.safeParse(item.payload);
      const answerKey = item.answerKey === null
        ? null
        : EXERCISE_ITEM_SCHEMAS_BY_KIND.MATCH_CLICK.answerKey.safeParse(item.answerKey);
      const userAnswer = item.userAnswer === null
        ? null
        : EXERCISE_ANSWER_SCHEMAS_BY_KIND.MATCH_CLICK.safeParse(item.userAnswer);

      if (!payload.success || (answerKey !== null && !answerKey.success)) {
        return <p className="text-sm text-destructive">{t('summaryInvalidItem')}</p>;
      }

      const leftById = new Map(payload.data.left.map((entry) => [entry.id, entry.text]));
      const rightById = new Map(payload.data.right.map((entry) => [entry.id, entry.text]));
      const pairList = (
        label: string,
        pairs: readonly { leftId: string; rightId: string }[],
        tone: 'default' | 'success',
      ) => (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <ul className="mt-1 space-y-1">
            {pairs.map((pair) => (
              <li
                key={`${pair.leftId}-${pair.rightId}`}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1 text-foreground',
                  tone === 'success' && 'bg-success/10 text-success',
                )}
              >
                {tone === 'success' && (
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span className="font-medium">{leftById.get(pair.leftId) ?? ''}</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{rightById.get(pair.rightId) ?? ''}</span>
              </li>
            ))}
          </ul>
        </div>
      );

      return (
        <div className="space-y-3 text-sm">
          {userAnswer?.success
            ? pairList(t('yourPairsLabel'), userAnswer.data.pairs, 'default')
            : <p className="text-muted-foreground">{t('answerStateNotAnswered')}</p>}
          {answerKey?.success && pairList(t('correctPairs'), answerKey.data.pairs, 'success')}
        </div>
      );
    }
    case 'VERB_CLOZE': {
      const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.VERB_CLOZE.payload.safeParse(item.payload);
      const answerKey = item.answerKey === null
        ? null
        : EXERCISE_ITEM_SCHEMAS_BY_KIND.VERB_CLOZE.answerKey.safeParse(item.answerKey);
      const userAnswer = item.userAnswer === null
        ? null
        : EXERCISE_ANSWER_SCHEMAS_BY_KIND.VERB_CLOZE.safeParse(item.userAnswer);

      if (!payload.success || (answerKey !== null && !answerKey.success)) {
        return <p className="text-sm text-destructive">{t('summaryInvalidItem')}</p>;
      }

      return (
        <div className="space-y-3 text-sm">
          <p className="whitespace-pre-wrap text-foreground">{payload.data.sentence}</p>
          <div>
            <span className="text-xs text-muted-foreground">{t('yourAnswerLabel')}: </span>
            <span
              className={cn(
                userAnswer?.success && item.isCorrect === true && 'text-success',
                userAnswer?.success && item.isCorrect === false && 'text-destructive',
                !userAnswer?.success && 'text-muted-foreground',
              )}
            >
              {userAnswer?.success ? userAnswer.data.text : t('answerStateNotAnswered')}
            </span>
          </div>
          {answerKey?.success && (
            <div>
              <span className="text-xs text-muted-foreground">{t('correctAnswerLabel')}: </span>
              <span className="font-medium text-success">{answerKey.data.canonical}</span>
            </div>
          )}
        </div>
      );
    }
    case 'AUDIO_WORD':
    case 'AUDIO_CLOZE':
    case 'AUDIO_SENTENCE':
    case 'AUDIO_CHOICE':
    case 'AUDIO_ORDER':
    case 'IMAGE_WORD':
    case 'IMAGE_CHOICE':
    case 'IMAGE_SPEAK':
    case 'AUDIO_SHADOW':
    case 'L1_SPEAK_PT':
      return (
        <p className="text-sm text-muted-foreground">
          {t('itemKindNotSupported', { kind: itemKindLabel(item.kind, t) })}
        </p>
      );
    default: {
      const exhaustive: never = item.kind;
      return <p className="text-sm text-destructive">{String(exhaustive)}</p>;
    }
  }
}
