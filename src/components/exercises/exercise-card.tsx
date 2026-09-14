'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  BookOpenText,
  CheckCircle,
  Circle,
  GitCompareArrows,
  ListChecks,
  TextCursorInput,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Progress,
  ProgressValue,
} from '@/components/ui/progress';
import type { SupportedLanguage } from '@/lib/constants/enums';
import type { ExerciseItemKind } from '@/lib/exercises';

type StudentExerciseStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface ExerciseCardProps {
  exerciseId: string;
  title: string;
  supportLanguage: SupportedLanguage;
  level: number;
  subject?: string | null;
  isNew: boolean;
  status: StudentExerciseStatus;
  itemCount: number;
  predominantKind: ExerciseItemKind | null;
  progress: {
    answeredCount: number;
    correctCount: number;
    itemCount: number;
  } | null;
}

const TYPE_ICONS: Partial<Record<ExerciseItemKind, LucideIcon>> = {
  MULTIPLE_CHOICE: ListChecks,
  MATCH_CLICK: GitCompareArrows,
  TEXT_CHOICE: BookOpenText,
  VERB_CLOZE: TextCursorInput,
};

const STATUS_ICONS: Record<StudentExerciseStatus, LucideIcon> = {
  NOT_STARTED: Circle,
  IN_PROGRESS: Timer,
  COMPLETED: CheckCircle,
};

function progressPercent(answeredCount: number, itemCount: number): number {
  if (itemCount <= 0) return 0;
  return Math.min(100, Math.max(0, (answeredCount / itemCount) * 100));
}

export function ExerciseCard({
  exerciseId,
  title,
  supportLanguage,
  level,
  subject,
  isNew,
  status,
  itemCount,
  predominantKind,
  progress,
}: ExerciseCardProps) {
  const t = useTranslations('exercises');
  const TypeIcon = predominantKind ? TYPE_ICONS[predominantKind] : undefined;
  const StatusIcon = STATUS_ICONS[status];
  const languageLabel =
    supportLanguage === 'PT_BR'
      ? t('supportLanguagePtBr')
      : supportLanguage === 'EN_US'
        ? t('supportLanguageEnUs')
        : supportLanguage === 'ES_ES'
          ? t('supportLanguageEsEs')
          : t('supportLanguageItIt');
  const statusLabel =
    status === 'NOT_STARTED'
      ? t('statusNotStarted')
      : status === 'IN_PROGRESS'
        ? t('statusInProgress')
        : t('statusCompleted');
  const percent = progress
    ? progressPercent(progress.answeredCount, progress.itemCount)
    : 0;

  return (
    <Link
      href={`/exercises/${exerciseId}`}
      data-testid={`exercise-assignment-card-${exerciseId}`}
      className="group flex min-h-11 h-full flex-col rounded-2xl border border-border bg-card p-5 transition-shadow duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex items-start gap-3">
        {TypeIcon && (
          <span className="rounded-xl bg-muted p-2 text-primary" aria-hidden="true">
            <TypeIcon
              className="h-5 w-5"
              data-testid={`exercise-kind-icon-${predominantKind}`}
              aria-hidden="true"
            />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-foreground">{title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {languageLabel}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {t('levelBadge', { level })}
            </Badge>
            {subject && (
              <Badge variant="outline" className="text-xs">
                {subject}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isNew && <Badge variant="default">{t('newBadge')}</Badge>}
        <Badge variant="outline">
          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {statusLabel}
        </Badge>
      </div>

      {progress && (
        <Progress
          className="mt-4"
          value={percent}
          aria-label={t('cardProgressLabel', {
            answered: progress.answeredCount,
            correct: progress.correctCount,
            total: progress.itemCount,
          })}
          data-testid="exercise-progress"
        >
          <span className="text-sm font-medium">
            {t('cardProgress', {
              answered: progress.answeredCount,
              total: progress.itemCount,
            })}
          </span>
          <ProgressValue>
            {() => t('cardProgressPercent', { percent: Math.round(percent) })}
          </ProgressValue>
        </Progress>
      )}

      <p className="mt-auto pt-4 text-xs text-muted-foreground">
        {t('questionCount', { count: itemCount })}
      </p>
    </Link>
  );
}
