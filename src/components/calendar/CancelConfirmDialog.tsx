'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cancelSession } from '@/actions/sessions';
import { toast } from 'sonner';

const LATE_CANCEL_HOURS = 12;

interface CancelConfirmDialogProps {
  session: { id: string; startAt: string; status: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}

export function CancelConfirmDialog({
  session,
  open,
  onOpenChange,
  onCancelled,
}: CancelConfirmDialogProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo aluno.
  const t = useTranslations('calendar.cancel');
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const hoursUntilSession =
    (new Date(session.startAt).getTime() - Date.now()) / (1000 * 60 * 60);
  const isLateCancellation = hoursUntilSession < LATE_CANCEL_HOURS;

  const handleCancel = () => {
    startTransition(async () => {
      try {
        const result = await cancelSession(session.id, reason || undefined);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(t('successToast'));
        onCancelled();
      } catch {
        toast.error(t('errorToast'));
      }
    });
  };

  return (
    <div
      data-testid="modal-cancel-session"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('dialogLabel')}
    >
      <div className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          {t('title')}
        </h3>

        {isLateCancellation ? (
          <div data-testid="modal-cancel-session-late-warning" className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4">
            <p className="text-sm text-destructive font-medium">
              {t('lateTitle')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('lateDesc', { hours: LATE_CANCEL_HOURS })}
            </p>
          </div>
        ) : (
          <div data-testid="modal-cancel-session-refund-notice" className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-4">
            <p className="text-sm text-emerald-700 font-medium">
              {t('refundNotice')}
            </p>
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="cancel-reason" className="text-sm font-medium text-foreground block mb-1">
            {t('reasonLabel')}
          </label>
          <Textarea
            data-testid="modal-cancel-session-reason-input"
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('reasonPlaceholder')}
            className="min-h-[80px] resize-none"
          />
        </div>

        <div className="flex gap-3">
          <Button
            data-testid="modal-cancel-session-back-button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="flex-1"
          >
            {t('back')}
          </Button>
          <Button
            data-testid="modal-cancel-session-confirm-button"
            variant="destructive"
            onClick={handleCancel}
            disabled={isPending}
            className="flex-1"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('cancelling')}
              </>
            ) : (
              t('submit')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
