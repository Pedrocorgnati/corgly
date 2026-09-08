'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { TimezoneDisplay } from '@/components/ui/timezone-display';
import { bookSession } from '@/actions/sessions';
import { toast } from 'sonner';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

type ModalState = 'idle' | 'confirming' | 'success' | 'error' | 'insufficient_credits';

const SESSION_DURATION_MINUTES = 50;
const CREDITS_PER_SESSION = 1;

interface BookingConfirmModalProps {
  slot: AvailabilitySlot;
  studentTz: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BookingConfirmModal({
  slot,
  studentTz,
  open,
  onClose,
  onSuccess,
}: BookingConfirmModalProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo aluno.
  const t = useTranslations('calendar.booking');
  const [state, setState] = useState<ModalState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!open) return null;

  const handleConfirm = async () => {
    setState('confirming');
    try {
      const result = await bookSession(slot.id);
      if (result.error) {
        // Ate 2026-09-07 a falta de credito era detectada procurando "credito"
        // DENTRO da mensagem — classificacao que morreria assim que a copy do
        // servidor mudasse de idioma. Agora quem discrimina e o `code` do
        // envelope, que nao tem lingua.
        if (result.code === 'INSUFFICIENT_CREDITS') {
          setState('insufficient_credits');
        } else {
          setErrorMessage(result.error);
          setState('error');
        }
        return;
      }
      setState('success');
      toast.success(t('successToast'));
    } catch {
      setErrorMessage(t('genericError'));
      setState('error');
    }
  };

  const handleClose = () => {
    setState('idle');
    setErrorMessage('');
    onClose();
  };

  const handleSuccessClose = () => {
    setState('idle');
    setErrorMessage('');
    onSuccess();
  };

  const handleRetry = () => {
    setState('idle');
    setErrorMessage('');
  };

  return (
    <div
      data-testid="modal-booking-confirm"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('dialogLabel')}
    >
      <div className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-md mx-4 p-6">
        {/* State: idle */}
        {state === 'idle' && (
          <>
            <h3 data-testid="modal-booking-confirm-header" className="text-lg font-semibold text-foreground mb-4">
              {t('title')}
            </h3>
            <div data-testid="modal-booking-confirm-summary" className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('datetime')}</span>
                <TimezoneDisplay
                  time={slot.startAt}
                  studentTz={studentTz}
                  adminTz="America/Sao_Paulo"
                  format="long"
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('duration')}</span>
                <span className="text-foreground">{t('durationValue', { minutes: SESSION_DURATION_MINUTES })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('cost')}</span>
                <span className="text-foreground">{t('costValue', { count: CREDITS_PER_SESSION })}</span>
              </div>
            </div>
            <div data-testid="modal-booking-confirm-actions" className="flex gap-3">
              <Button data-testid="modal-booking-confirm-cancel-button" variant="outline" onClick={handleClose} className="flex-1">
                {t('cancel')}
              </Button>
              <Button data-testid="modal-booking-confirm-submit-button" onClick={handleConfirm} className="flex-1">
                {t('confirm')}
              </Button>
            </div>
          </>
        )}

        {/* State: confirming */}
        {state === 'confirming' && (
          <div data-testid="modal-booking-confirm-loading" className="flex flex-col items-center py-8">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
            <p className="text-foreground font-medium">{t('confirming')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('confirmingHint')}</p>
          </div>
        )}

        {/* State: success */}
        {state === 'success' && (
          <div data-testid="modal-booking-confirm-success" className="flex flex-col items-center py-8">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-4" />
            <p className="text-foreground font-medium">{t('successTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              {t('successDesc')}
            </p>
            <Button data-testid="modal-booking-confirm-history-button" onClick={handleSuccessClose} className="mt-6 w-full">
              {t('history')}
            </Button>
          </div>
        )}

        {/* State: error */}
        {state === 'error' && (
          <div data-testid="modal-booking-confirm-error" className="flex flex-col items-center py-8">
            <XCircle className="h-10 w-10 text-destructive mb-4" />
            <p className="text-foreground font-medium">{t('errorTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              {errorMessage}
            </p>
            <div data-testid="modal-booking-confirm-error-actions" className="flex gap-3 mt-6 w-full">
              <Button data-testid="modal-booking-confirm-error-close-button" variant="outline" onClick={handleClose} className="flex-1">
                {t('close')}
              </Button>
              <Button data-testid="modal-booking-confirm-retry-button" onClick={handleRetry} className="flex-1">
                {t('retry')}
              </Button>
            </div>
          </div>
        )}

        {/* State: insufficient_credits */}
        {state === 'insufficient_credits' && (
          <div data-testid="modal-booking-confirm-insufficient-credits" className="flex flex-col items-center py-8">
            <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
            <p className="text-foreground font-medium">{t('insufficientTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              {t('insufficientDesc')}
            </p>
            <div data-testid="modal-booking-confirm-credits-actions" className="flex gap-3 mt-6 w-full">
              <Button data-testid="modal-booking-confirm-credits-close-button" variant="outline" onClick={handleClose} className="flex-1">
                {t('close')}
              </Button>
              <Button data-testid="modal-booking-confirm-buy-credits-button" asChild className="flex-1">
                <Link href={ROUTES.CREDITS}>{t('buyCredits')}</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
