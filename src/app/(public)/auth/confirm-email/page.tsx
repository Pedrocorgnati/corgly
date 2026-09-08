'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { CheckCircle2, Mail, AlertTriangle, Loader2 } from 'lucide-react';
import { ROUTES, API } from '@/lib/constants/routes';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthPageWrapper } from '@/components/shared';

type ConfirmState = 'loading' | 'success' | 'error' | 'instructions';

function ConfirmEmailContent() {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo usuario.
  const t = useTranslations('pages.auth.confirmEmail');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<ConfirmState>(token ? 'loading' : 'instructions');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) return;

    async function confirmEmail() {
      try {
        await apiClient.post(API.AUTH.CONFIRM_EMAIL, { token });
        setState('success');
      } catch (err) {
        setState('error');
        if (err instanceof ApiError) {
          setErrorMessage(err.message || t('errorFallback'));
        } else {
          setErrorMessage(t('connectionError'));
        }
      }
    }

    confirmEmail();
  }, [token, t]);

  if (state === 'loading') {
    return (
      <AuthPageWrapper>
        <div data-testid="page-auth-confirm-email" className="w-full max-w-[384px]">
          <div data-testid="auth-confirm-email-loading" className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" />
            <h1 className="text-xl font-bold text-foreground">{t('loadingTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('loadingDesc')}</p>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  if (state === 'success') {
    return (
      <AuthPageWrapper>
        <div data-testid="page-auth-confirm-email" className="w-full max-w-[384px]">
          <div data-testid="auth-confirm-email-success" className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <h1 className="text-xl font-bold text-foreground">{t('successTitle')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('successDesc')}
            </p>
            <Link data-testid="auth-confirm-email-login-link" href={ROUTES.LOGIN} className={cn(buttonVariants(), 'w-full')}>
              {t('goToLogin')}
            </Link>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  if (state === 'error') {
    return (
      <AuthPageWrapper>
        <div data-testid="page-auth-confirm-email" className="w-full max-w-[384px]">
          <div data-testid="auth-confirm-email-error" className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">{t('errorTitle')}</h1>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Link
              data-testid="auth-confirm-email-resend-link"
              href={ROUTES.RESEND_CONFIRMATION}
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
            >
              {t('resendLink')}
            </Link>
            <Link
              data-testid="auth-confirm-email-back-login-link"
              href={ROUTES.LOGIN}
              className="block text-sm text-primary font-medium hover:underline"
            >
              {t('backToLogin')}
            </Link>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  // state === 'instructions' — no token, show instructions
  return (
    <div data-testid="page-auth-confirm-email" className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-[384px]">
        <div data-testid="auth-confirm-email-instructions" className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
              <Mail className="h-8 w-8 text-success" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">{t('instructionsTitle')}</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {t('instructionsDesc')}
          </p>
          <div className="bg-muted/50 rounded-xl p-4 mb-6 text-sm text-muted-foreground">
            <p>{t('spamHint')}</p>
          </div>
          <Link
            data-testid="auth-confirm-email-resend-link"
            href={ROUTES.RESEND_CONFIRMATION}
            className={cn(buttonVariants({ variant: 'outline' }), 'w-full mb-3')}
          >
            {t('resendLink')}
          </Link>
          <Link
            data-testid="auth-confirm-email-back-login-link"
            href={ROUTES.LOGIN}
            className="text-sm text-primary font-medium hover:underline"
          >
            {t('backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense>
      <ConfirmEmailContent />
    </Suspense>
  );
}
