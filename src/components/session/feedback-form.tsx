'use client';
import { API } from '@/lib/constants/routes';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

const DIMENSIONS = [
  { key: 'listening' as const,  label: 'Escuta e Compreensão',    feedbackKey: 'listeningFeedback' as const },
  { key: 'speaking' as const,   label: 'Fala e Pronúncia',        feedbackKey: 'speakingFeedback' as const },
  { key: 'writing' as const,    label: 'Escrita',                 feedbackKey: 'writingFeedback' as const },
  { key: 'vocabulary' as const, label: 'Vocabulário',             feedbackKey: 'vocabularyFeedback' as const },
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
      <div className="bg-card border border-border rounded-2xl p-6 text-center shadow-sm space-y-4">
        <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
        <h2 className="text-xl font-bold text-foreground">Avaliação enviada!</h2>
        <p className="text-sm text-muted-foreground">
          Obrigada pelo seu feedback. Ele nos ajuda a melhorar continuamente.
        </p>
        <Link href={ROUTES.DASHBOARD} className={cn(buttonVariants(), 'w-full text-center')}>
          ← Voltar ao dashboard
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

      toast.success('Obrigado pela sua avaliação!');
      setSent(true);
      router.push(ROUTES.DASHBOARD);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Erro ao enviar avaliação. Tente novamente.');
      }
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <h1 className="text-xl font-bold text-foreground mb-6">
        {existingFeedback ? 'Sua avaliação' : 'Avaliar sua aula'}
      </h1>

      {isWindowExpired && !existingFeedback && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-6">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            O prazo para avaliar esta aula expirou.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {DIMENSIONS.map((dim) => (
          <Controller
            key={dim.key}
            name={`scores.${dim.key}`}
            control={control}
            render={({ field, fieldState }) => (
              <StarRating
                dimension={dim.key}
                label={dim.label}
                value={field.value}
                onChange={field.onChange}
                disabled={isSubmitting || isReadonly}
                error={fieldState.error?.message}
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
                Comentário sobre {dim.label} (opcional)
              </label>
              <Textarea
                id={dim.feedbackKey}
                {...register(dim.feedbackKey)}
                placeholder={`O que observou sobre ${dim.label.toLowerCase()}?`}
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
            Comentário geral (opcional, mínimo 20 caracteres)
          </label>
          <Textarea
            id="overallFeedback"
            {...register('overallFeedback')}
            placeholder="Compartilhe sua experiência geral..."
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
            disabled={isSubmitting}
            className="w-full h-12"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Enviando...
              </>
            ) : (
              'Enviar avaliação'
            )}
          </Button>
        )}
      </form>
    </div>
  );
}
