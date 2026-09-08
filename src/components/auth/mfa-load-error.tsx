'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui/error-state';

/** Estado de erro (fail-closed) quando o status de MFA nao pode ser lido no servidor. */
export function MfaLoadError() {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma do admin.
  const t = useTranslations('auth.mfa');
  const router = useRouter();
  return (
    <ErrorState
      data-testid="auth-mfa-load-error"
      title={t('loadErrorTitle')}
      message={t('loadErrorDesc')}
      onRetry={() => router.refresh()}
    />
  );
}
