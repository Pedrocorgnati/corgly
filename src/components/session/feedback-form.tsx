'use client';
import { API } from '@/lib/constants/routes';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from '@/components/feedback/StarRating';
import { ROUTES } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import { submitFeedbackSchema, type SubmitFeedbackInput } from '@/schemas/feedback.schema';
import { cn } from '@/lib/utils';

// Ate 2026-09-07 os rotulos das dimensoes eram portugues cravado neste array de
// modulo e ignoravam o idioma escolhido pelo aluno. Agora so a CHAVE mora aqui.
const DIMENSIONS = [
  { key: 'listening' as const,  labelKey: 'dimListening',  feedbackKey: 'listeningFeedback' as const },
  { key: 'speaking' as const,   labelKey: 'dimSpeaking',   feedbackKey: 'speakingFeedback' as const },
  { key: 'writing' as const,    labelKey: 'dimWriting',    feedbackKey: 'writingFeedback' as const },
  { key: 'vocabulary' as const, labelKey: 'dimVocabulary', feedbackKey: 'vocabularyFeedback' as const },
];

interface FeedbackFormProps {
  sessionId: string;
  /** Whether the feedback window has expired */
  isWindowExpired?: boolean;
  /** Pre-existing feedback (readonly mode) */
  existingFeedback?: SubmitFeedbackInput | null;
}

export function FeedbackForm({
  sessionId,
  isWindowExpired = false,
  existingFeedback = null,
}: FeedbackFormProps) {
  const t = useTranslations('sessionRoom.feedback');
  const router = useRouter();
  const [sent, setSent] = useState(false);

  const isReadonly = isWindowExpired || !!existingFeedback;

  const {
    control,
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SubmitFeedbackInput>({
    resolver: zodResolver(submitFeedbackSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: existingFeedback ?? {
      scores: {
        listening: 0,
        speaking: 0,
        writing: 0,
        vocabulary: 0,
      },
      overallFeedback: undefined,
    },
  });


  if (sent) {
    return (
      <div data-testid="session-feedback-success" className="bg-card border border-border rounded-2xl p-6 text-center shadow-sm space-y-4">
        <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
        <h2 className="text-xl font-bold text-foreground">{t('sentTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('sentDesc')}
        </p>
        <Link href={ROUTES.DASHBOARD} data-testid="session-feedback-dashboard-link" className={cn(buttonVariants(), 'w-full text-center')}>
          {t('backDashboard')}
        </Link>
      </div>
    );
  }

  const onSubmit = async (data: SubmitFeedbackInput) => {
    try {
      await apiClient.post(API.SESSION_FEEDBACK(sessionId), {
        scores:             data.scores,
        overallFeedback:    data.overallFeedback || undefined,
        listeningFeedback:  data.listeningFeedback || undefined,
        speakingFeedback:   data.speakingFeedback || undefined,
        writingFeedback:    data.writingFeedback || undefined,
        vocabularyFeedback: data.vocabularyFeedback || undefined,
      });

      toast.success(t('successToast'));
      setSent(true);
      router.push(ROUTES.DASHBOARD);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error(t('submitError'));
      }
    }
  };

  return (
    <div data-testid="session-feedback-panel" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <h1 data-testid="session-feedback-header" className="text-xl font-bold text-foreground mb-6">
        {existingFeedback ? t('titleExisting') : t('titleNew')}
      </h1>

      {isWindowExpired && !existingFeedback && (
        <div data-testid="session-feedback-window-expired" className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-6">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {t('windowExpired')}
          </p>
        </div>
      )}

      <form data-testid="session-feedback-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {DIMENSIONS.map((dim) => (
          <Controller
            key={dim.key}
            name={`scores.${dim.key}`}
            control={control}
            render={({ field, fieldState }) => (
              <StarRating
                dimension={dim.key}
                label={t(dim.labelKey)}
                value={field.value}
                onChange={field.onChange}
                disabled={isSubmitting || isReadonly}
                error={fieldState.error?.message}
                data-testid={`session-feedback-rating-${dim.key}`}
              />
            )}
          />
        ))}

        {DIMENSIONS.map((dim) => {
          const val = watch(dim.feedbackKey as keyof SubmitFeedbackInput) as string | undefined;
          const len = val?.length ?? 0;
          return (
            <div key={dim.feedbackKey}>
              <label className="text-sm font-medium text-foreground mb-1 block" htmlFor={dim.feedbackKey}>
                {t('dimComment', { dimension: t(dim.labelKey) })}
              </label>
              <Textarea
                id={dim.feedbackKey}
                data-testid={`session-feedback-${dim.key}-comment`}
                {...register(dim.feedbackKey)}
                placeholder={t('dimPlaceholder', {
                  dimension: t(dim.labelKey).toLowerCase(),
                })}
                rows={2}
                maxLength={300}
                disabled={isSubmitting || isReadonly}
                className="resize-none"
              />
              <p className={`text-xs mt-0.5 text-right ${len > 270 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {len}/300
              </p>
            </div>
          );
        })}

        <div>
          <label className="text-sm font-medium text-foreground mb-1 block" htmlFor="overallFeedback">
            {t('overallLabel')}
          </label>
          <Textarea
            id="overallFeedback"
            data-testid="session-feedback-overall-comment"
            {...register('overallFeedback')}
            placeholder={t('overallPlaceholder')}
            rows={4}
            maxLength={500}
            disabled={isSubmitting || isReadonly}
            className="resize-none text-base"
            aria-invalid={!!errors.overallFeedback}
            aria-describedby={errors.overallFeedback ? 'overallFeedback-error' : undefined}
          />
          <div className="flex justify-between mt-0.5">
            {errors.overallFeedback ? (
              <p id="overallFeedback-error" className="text-xs text-destructive" role="alert">{errors.overallFeedback.message}</p>
            ) : (
              <span />
            )}
            <p className={`text-xs ${(watch('overallFeedback')?.length ?? 0) > 450 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {watch('overallFeedback')?.length ?? 0}/500
            </p>
          </div>
        </div>

        {!isReadonly && (
          <Button
            type="submit"
            data-testid="session-feedback-submit-button"
            disabled={isSubmitting}
            className="w-full h-12"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('submitting')}
              </>
            ) : (
              t('submit')
            )}
          </Button>
        )}
      </form>
    </div>
  );
}
