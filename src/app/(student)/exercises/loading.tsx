import { CardSkeleton, Skeleton } from '@/components/ui/loading-skeleton';
import { PageWrapper } from '@/components/shared';
import { useTranslations } from 'next-intl';

export default function ExercisesLoading() {
  const t = useTranslations('loading');

  return (
    <PageWrapper data-testid="exercises-loading">
      <div role="status" aria-live="polite" aria-busy="true" aria-label={t('aria')}>
        <span className="sr-only">{t('message')}</span>
        <Skeleton className="mb-4 h-4 w-40" />

        <div className="mb-6 flex items-center gap-3">
          <Skeleton className="h-6 w-6" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>

        <ul
          data-testid="exercise-assignments-loading-list"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: 3 }).map((_, index) => (
            <li
              key={index}
              className="h-full min-h-48 [&>div]:h-full [&>div]:rounded-2xl [&>div]:p-5"
            >
              <CardSkeleton />
            </li>
          ))}
        </ul>
      </div>
    </PageWrapper>
  );
}
