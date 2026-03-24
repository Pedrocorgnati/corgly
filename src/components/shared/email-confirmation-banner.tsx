'use client';
import { STORAGE_KEYS } from '@/lib/constants';

import { useState, useEffect } from 'react';
import { MailWarning, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';



interface EmailConfirmationBannerProps {
  emailConfirmed: boolean;
}

export function EmailConfirmationBanner({ emailConfirmed }: EmailConfirmationBannerProps) {
  const [visible, setVisible] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (emailConfirmed) return;
    // Check sessionStorage — user may have dismissed in this session
    const dismissed = typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEYS.SESSION.EMAIL_BANNER_DISMISSED) === '1';
    setVisible(!dismissed);
  }, [emailConfirmed]);

  if (!visible) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION.EMAIL_BANNER_DISMISSED, '1');
    setVisible(false);
  };

  const handleResend = async () => {
    setIsSending(true);
    try {
      await apiClient.post(API.AUTH.RESEND_CONFIRMATION, {});
      toast.success('E-mail de confirmação reenviado! Verifique sua caixa de entrada.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast.error('Muitas tentativas. Aguarde alguns minutos antes de reenviar.');
      } else {
        toast.error('Erro ao reenviar o e-mail. Tente novamente.');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm"
    >
      <MailWarning className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <p className="flex-1">
        Confirme seu e-mail para acessar todos os recursos da plataforma.
      </p>

      <Button
        variant="outline"
        size="sm"
        onClick={handleResend}
        disabled={isSending}
        className="shrink-0 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 min-h-[36px]"
        aria-label="Reenviar e-mail de confirmação"
      >
        {isSending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
            Enviando...
          </>
        ) : (
          'Reenviar e-mail'
        )}
      </Button>

      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 text-amber-600 hover:text-amber-900 min-h-[36px] min-w-[36px] flex items-center justify-center rounded"
        aria-label="Dispensar aviso de confirmação de e-mail"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
