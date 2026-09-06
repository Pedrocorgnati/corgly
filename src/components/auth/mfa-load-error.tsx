'use client';

import { useRouter } from 'next/navigation';
import { ErrorState } from '@/components/ui/error-state';

/** Estado de erro (fail-closed) quando o status de MFA nao pode ser lido no servidor. */
export function MfaLoadError() {
  const router = useRouter();
  return (
    <ErrorState
      data-testid="auth-mfa-load-error"
      title="Erro ao carregar o status do MFA"
      message="Não foi possível verificar o status do MFA. Tente novamente."
      onRetry={() => router.refresh()}
    />
  );
}
