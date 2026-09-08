'use client';
import { STORAGE_KEYS } from '@/lib/constants';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { MailWarning, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';



interface EmailConfirmationBannerProps {
  emailConfirmed: boolean;
}

export function EmailConfirmationBanner({ emailConfirmed }: EmailConfirmationBannerProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo usuario — inclusive os tres toasts do reenvio.
  const t = useTranslations('auth.emailBanner');
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
      toast.success(t('resentToast'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast.error(t('rateLimitToast'));
      } else {
        toast.error(t('errorToast'));
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      data-testid="email-confirmation-banner"
      role="alert"
      aria-live="polite"
      className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm"
    >
      <MailWarning className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <p className="flex-1">
        {t('message')}
      </p>

      <Button
        data-testid="email-confirmation-resend-button"
        variant="outline"
        size="sm"
        onClick={handleResend}
        disabled={isSending}
        className="shrink-0 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 min-h-[36px]"
        aria-label={t('resendAria')}
      >
        {isSending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
            {t('sending')}
          </>
        ) : (
          t('resend')
        )}
      </Button>

      <button
        data-testid="email-confirmation-dismiss-button"
        type="button"
        onClick={handleDismiss}
        className="shrink-0 text-amber-600 hover:text-amber-900 min-h-[36px] min-w-[36px] flex items-center justify-center rounded"
        aria-label={t('dismissAria')}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
