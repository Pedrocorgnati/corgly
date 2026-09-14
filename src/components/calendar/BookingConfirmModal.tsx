'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { TimezoneDisplay } from '@/components/ui/timezone-display';
import { bookSession } from '@/actions/sessions';
import type { SessionConflictAlternative } from '@/actions/sessions';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { toast } from 'sonner';
import type { AvailabilitySlot } from '@/hooks/useCalendar';
import { slotDurationMinutes } from '@/lib/bookings/slot-duration';

type ModalState = 'idle' | 'confirming' | 'success' | 'error' | 'conflict' | 'insufficient_credits';

const CREDITS_PER_SESSION = 1;

interface BookingConfirmModalProps {
  slot: AvailabilitySlot;
  studentTz: string;
  adminTz: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BookingConfirmModal({
  slot,
  studentTz,
  adminTz,
  open,
  onClose,
  onSuccess,
}: BookingConfirmModalProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo aluno.
  const t = useTranslations('calendar.booking');
  const [state, setState] = useState<ModalState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [alternatives, setAlternatives] = useState<SessionConflictAlternative[]>([]);
  const requestInFlightRef = useRef(false);
  const idempotencyKeysRef = useRef(new Map<string, string>());

  const handleClose = () => {
    requestInFlightRef.current = false;
    idempotencyKeysRef.current.clear();
    setState('idle');
    setErrorMessage('');
    setAlternatives([]);
    onClose();
  };

  const handleSuccessClose = () => {
    requestInFlightRef.current = false;
    idempotencyKeysRef.current.clear();
    setState('idle');
    setErrorMessage('');
    setAlternatives([]);
    onSuccess();
  };

  // Esc e clique no fundo reaproveitam o handler do controle de fechar que cada
  // estado mostra. `success` usa `handleSuccessClose`: `handleClose` pularia o
  // `onSuccess`. `confirming` nao mostra controle de fechar e fica inerte: o
  // `handleClose` soltaria a trava do item 032 (`requestInFlightRef` e as chaves
  // idempotentes) com o `bookSession` ainda em voo.
  const dismissByState: Record<ModalState, (() => void) | null> = {
    idle: handleClose,
    confirming: null,
    success: handleSuccessClose,
    error: handleClose,
    conflict: handleClose,
    insufficient_credits: handleClose,
  };

  const { dialogRef, handleBackdropClick } = useDialogA11y<HTMLDivElement>({
    open,
    onDismiss: dismissByState[state],
    focusKey: state,
  });

  if (!open) return null;

  const durationMinutes = slotDurationMinutes(slot);

  const handleConfirm = async (slotId = slot.id) => {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    const idempotencyKey =
      idempotencyKeysRef.current.get(slotId) ?? crypto.randomUUID();
    idempotencyKeysRef.current.set(slotId, idempotencyKey);
    setState('confirming');
    try {
      const result = await bookSession(slotId, idempotencyKey);
      if (result.error) {
        if (result.data?.alternatives?.length) {
          setAlternatives(result.data.alternatives);
          setErrorMessage(result.error);
          setState('conflict');
          return;
        }
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
    } finally {
      requestInFlightRef.current = false;
    }
  };

  const handleRetry = () => {
    setState('idle');
    setErrorMessage('');
    setAlternatives([]);
  };

  return (
    <div
      ref={dialogRef}
      data-testid="modal-booking-confirm"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={t('dialogLabel')}
      tabIndex={-1}
      onClick={handleBackdropClick}
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
                  adminTz={adminTz}
                  format="long"
                />
              </div>
              {/* Duracao lida de `endAt`; invalida (`null`) omite a linha inteira. */}
              {durationMinutes !== null && (
                <div data-testid="modal-booking-confirm-duration" className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('duration')}</span>
                  <span className="text-foreground">{t('durationValue', { minutes: durationMinutes })}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('cost')}</span>
                <span className="text-foreground">{t('costValue', { count: CREDITS_PER_SESSION })}</span>
              </div>
            </div>
            <div data-testid="modal-booking-confirm-actions" className="flex gap-3">
              <Button data-testid="modal-booking-confirm-cancel-button" variant="outline" onClick={handleClose} className="flex-1">
                {t('cancel')}
              </Button>
              <Button data-testid="modal-booking-confirm-submit-button" onClick={() => void handleConfirm()} className="flex-1">
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

        {/* State: conflict */}
        {state === 'conflict' && (
          <div data-testid="modal-booking-confirm-conflict" role="alert" className="flex flex-col items-center py-8">
            <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
            <p className="text-foreground font-medium">{t('conflictTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              {errorMessage}
            </p>
            <p className="text-sm text-muted-foreground mt-3 text-center">
              {t('conflictDescription')}
            </p>
            <div data-testid="modal-booking-confirm-alternatives" className="mt-5 grid w-full gap-2">
              {alternatives.map((alternative) => (
                <Button
                  key={alternative.id}
                  data-testid={`modal-booking-confirm-alternative-${alternative.id}`}
                  variant="outline"
                  onClick={() => void handleConfirm(alternative.id)}
                  aria-label={t('chooseAlternative')}
                >
                  <TimezoneDisplay
                    time={alternative.startAt}
                    studentTz={studentTz}
                    adminTz={adminTz}
                    format="long"
                  />
                </Button>
              ))}
            </div>
            <Button variant="ghost" onClick={handleClose} className="mt-4 w-full">
              {t('close')}
            </Button>
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
              <Button
                data-testid="modal-booking-confirm-buy-credits-button"
                asChild
                nativeButton={false}
                className="flex-1"
              >
                <Link href={ROUTES.CREDITS}>{t('buyCredits')}</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
