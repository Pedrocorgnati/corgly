'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { TimezoneDisplay } from '@/components/ui/timezone-display';
import { bookSession } from '@/actions/sessions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AvailabilitySlot } from '@/hooks/useCalendar';

type ModalState = 'idle' | 'confirming' | 'success' | 'error' | 'insufficient_credits';

const SESSION_DURATION_MINUTES = 50;

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
  const [state, setState] = useState<ModalState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!open) return null;

  const handleConfirm = async () => {
    setState('confirming');
    try {
      const result = await bookSession(slot.id);
      if (result.error) {
        if (result.error.toLowerCase().includes('crédito') || result.error.toLowerCase().includes('credit')) {
          setState('insufficient_credits');
        } else {
          setErrorMessage(result.error);
          setState('error');
        }
        return;
      }
      setState('success');
      toast.success('Aula agendada com sucesso!');
    } catch {
      setErrorMessage('Erro ao agendar. Tente novamente.');
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar agendamento"
    >
      <div className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-md mx-4 p-6">
        {/* State: idle */}
        {state === 'idle' && (
          <>
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Confirmar agendamento
            </h3>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Data e horário:</span>
                <TimezoneDisplay
                  time={slot.startAt}
                  studentTz={studentTz}
                  adminTz="America/Sao_Paulo"
                  format="long"
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Duração:</span>
                <span className="text-foreground">{SESSION_DURATION_MINUTES} minutos</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Custo:</span>
                <span className="text-foreground">1 crédito</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleConfirm} className="flex-1">
                Confirmar
              </Button>
            </div>
          </>
        )}

        {/* State: confirming */}
        {state === 'confirming' && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
            <p className="text-foreground font-medium">Confirmando...</p>
            <p className="text-sm text-muted-foreground mt-1">Aguarde um momento</p>
          </div>
        )}

        {/* State: success */}
        {state === 'success' && (
          <div className="flex flex-col items-center py-8">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-4" />
            <p className="text-foreground font-medium">Aula agendada!</p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              Sua aula foi confirmada com sucesso.
            </p>
            <Button onClick={handleSuccessClose} className="mt-6 w-full">
              Ver histórico
            </Button>
          </div>
        )}

        {/* State: error */}
        {state === 'error' && (
          <div className="flex flex-col items-center py-8">
            <XCircle className="h-10 w-10 text-destructive mb-4" />
            <p className="text-foreground font-medium">Erro ao agendar</p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              {errorMessage}
            </p>
            <div className="flex gap-3 mt-6 w-full">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Fechar
              </Button>
              <Button onClick={handleRetry} className="flex-1">
                Tentar novamente
              </Button>
            </div>
          </div>
        )}

        {/* State: insufficient_credits */}
        {state === 'insufficient_credits' && (
          <div className="flex flex-col items-center py-8">
            <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
            <p className="text-foreground font-medium">Créditos insuficientes</p>
            <p className="text-sm text-muted-foreground mt-1 text-center">
              Você não possui créditos suficientes para agendar esta aula.
            </p>
            <div className="flex gap-3 mt-6 w-full">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Fechar
              </Button>
              <Button asChild className="flex-1">
                <Link href={ROUTES.CREDITS}>Adquirir créditos</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
