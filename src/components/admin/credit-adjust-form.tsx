'use client';
import { API } from '@/lib/constants/routes';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiClient, ApiError } from '@/lib/api-client';

const MIN_CREDITS = 1;
const MAX_CREDITS = 50;
const MIN_REASON_LENGTH = 10;

const adjustSchema = z.object({
  userId: z.string().min(1),
  credits: z.coerce
    .number({ invalid_type_error: 'invalid' })
    .int('int')
    .min(MIN_CREDITS, 'min')
    .max(MAX_CREDITS, 'max'),
  reason: z.string().min(MIN_REASON_LENGTH, 'min'),
});

interface FieldErrors {
  userId?: string;
  credits?: string;
  reason?: string;
}

export function CreditAdjustForm() {
  const t = useTranslations('credits.admin.adjust');
  const [isPending, startTransition] = useTransition();
  const [userId, setUserId] = useState('');
  const [credits, setCredits] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  function resetForm() {
    setUserId('');
    setCredits('');
    setReason('');
    setErrors({});
  }

  function resolveError(field: string, code: string): string {
    if (field === 'userId') return t('errorRequired');
    if (field === 'credits') {
      if (code === 'min') return t('errorCreditsMin', { min: MIN_CREDITS });
      if (code === 'max') return t('errorCreditsMax', { max: MAX_CREDITS });
      return t('errorCreditsMin', { min: MIN_CREDITS });
    }
    if (field === 'reason') return t('errorReasonMin', { min: MIN_REASON_LENGTH });
    return code;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = adjustSchema.safeParse({
      userId: userId.trim(),
      credits: credits,
      reason: reason.trim(),
    });

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[field]) {
          fieldErrors[field] = resolveError(String(field), issue.message);
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});

    startTransition(async () => {
      try {
        await apiClient.post(API.CREDITS_MANUAL, parsed.data);
        toast.success(t('success'));
        resetForm();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Error');
      }
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground mb-4">{t('title')}</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="adjust-userId" className="block text-sm font-medium text-foreground mb-1">
            {t('userId')}
          </label>
          <Input
            id="adjust-userId"
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={t('userIdPlaceholder')}
            disabled={isPending}
            aria-invalid={!!errors.userId}
            aria-describedby={errors.userId ? 'adjust-userId-error' : undefined}
          />
          {errors.userId && (
            <p id="adjust-userId-error" className="text-destructive text-xs mt-1">{errors.userId}</p>
          )}
        </div>

        <div>
          <label htmlFor="adjust-credits" className="block text-sm font-medium text-foreground mb-1">
            {t('credits', { min: MIN_CREDITS, max: MAX_CREDITS })}
          </label>
          <Input
            id="adjust-credits"
            type="number"
            min={MIN_CREDITS}
            max={MAX_CREDITS}
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            placeholder={t('creditsPlaceholder')}
            disabled={isPending}
            aria-invalid={!!errors.credits}
            aria-describedby={errors.credits ? 'adjust-credits-error' : undefined}
          />
          {errors.credits && (
            <p id="adjust-credits-error" className="text-destructive text-xs mt-1">{errors.credits}</p>
          )}
        </div>

        <div>
          <label htmlFor="adjust-reason" className="block text-sm font-medium text-foreground mb-1">
            {t('reason', { min: MIN_REASON_LENGTH })}
          </label>
          <Textarea
            id="adjust-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('reasonPlaceholder')}
            disabled={isPending}
            aria-invalid={!!errors.reason}
            aria-describedby={errors.reason ? 'adjust-reason-error' : undefined}
            className="min-h-[88px] resize-none"
          />
          {errors.reason && (
            <p id="adjust-reason-error" className="text-destructive text-xs mt-1">{errors.reason}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="w-full min-h-[44px]"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('submitting')}
            </>
          ) : (
            t('submit')
          )}
        </Button>
      </form>
    </div>
  );
}
