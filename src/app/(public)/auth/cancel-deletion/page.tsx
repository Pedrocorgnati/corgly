'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { ROUTES, API } from '@/lib/constants/routes';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthPageWrapper } from '@/components/shared';

type CancelState = 'loading' | 'success' | 'error' | 'no-token';

function CancelDeletionContent() {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo usuario.
  const t = useTranslations('pages.auth.cancelDeletion');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<CancelState>(token ? 'loading' : 'no-token');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) return;

    async function cancelDeletion() {
      try {
        await apiClient.post(API.AUTH.CANCEL_DELETION, { token });
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

    cancelDeletion();
  }, [token, t]);

  if (state === 'loading') {
    return (
      <AuthPageWrapper>
        <div data-testid="page-auth-cancel-deletion" className="w-full max-w-[384px]">
          <div data-testid="auth-cancel-deletion-loading" className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
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
        <div data-testid="page-auth-cancel-deletion" className="w-full max-w-[384px]">
          <div data-testid="auth-cancel-deletion-success" className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <h1 className="text-xl font-bold text-foreground">{t('successTitle')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('successDesc')}
            </p>
            <Link data-testid="auth-cancel-deletion-login-link" href={ROUTES.LOGIN} className={cn(buttonVariants(), 'w-full')}>
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
        <div data-testid="page-auth-cancel-deletion" className="w-full max-w-[384px]">
          <div data-testid="auth-cancel-deletion-error" className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">{t('errorTitle')}</h1>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <p className="text-sm text-muted-foreground">
              {t('errorSupportHint')}
            </p>
            <Link data-testid="auth-cancel-deletion-login-link" href={ROUTES.LOGIN} className={cn(buttonVariants(), 'w-full')}>
              {t('goToLogin')}
            </Link>
            <Link
              data-testid="auth-cancel-deletion-support-link"
              href={ROUTES.SUPPORT}
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
            >
              {t('contactSupport')}
            </Link>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  // no-token
  return (
    <AuthPageWrapper>
      <div data-testid="page-auth-cancel-deletion" className="w-full max-w-[384px]">
        <div data-testid="auth-cancel-deletion-no-token" className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-foreground">{t('noTokenTitle')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('noTokenDesc')}
          </p>
          <Link data-testid="auth-cancel-deletion-login-link" href={ROUTES.LOGIN} className={cn(buttonVariants(), 'w-full')}>
            {t('goToLogin')}
          </Link>
        </div>
      </div>
    </AuthPageWrapper>
  );
}

export default function CancelDeletionPage() {
  return (
    <Suspense>
      <CancelDeletionContent />
    </Suspense>
  );
}
