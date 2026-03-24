'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthPageWrapper } from '@/components/shared';

type CancelState = 'loading' | 'success' | 'error' | 'no-token';

function CancelDeletionContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<CancelState>(token ? 'loading' : 'no-token');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) return;

    async function cancelDeletion() {
      try {
        // cancel-deletion API uses GET with query param
        await apiClient.get(API.AUTH.CANCEL_DELETION, { params: { token } });
        setState('success');
      } catch (err) {
        setState('error');
        if (err instanceof ApiError) {
          setErrorMessage(err.message || 'Link inválido ou expirado.');
        } else {
          setErrorMessage('Erro de conexão. Tente novamente.');
        }
      }
    }

    cancelDeletion();
  }, [token]);

  if (state === 'loading') {
    return (
      <AuthPageWrapper>
        <div className="w-full max-w-[384px]">
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" />
            <h1 className="text-xl font-bold text-foreground">Cancelando exclusão...</h1>
            <p className="text-sm text-muted-foreground">Aguarde um momento.</p>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  if (state === 'success') {
    return (
      <AuthPageWrapper>
        <div className="w-full max-w-[384px]">
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Sua conta foi restaurada</h1>
            <p className="text-sm text-muted-foreground">
              A solicitação de exclusão foi cancelada com sucesso. Sua conta está ativa novamente.
            </p>
            <Link href={ROUTES.LOGIN} className={cn(buttonVariants(), 'w-full')}>
              Ir para o login
            </Link>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  if (state === 'error') {
    return (
      <AuthPageWrapper>
        <div className="w-full max-w-[384px]">
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Link inválido ou expirado</h1>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Link href={ROUTES.LOGIN} className={cn(buttonVariants(), 'w-full')}>
              Ir para o login
            </Link>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  // no-token
  return (
    <AuthPageWrapper>
      <div className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este link não contém um token válido. Verifique o link recebido por email.
          </p>
          <Link href={ROUTES.LOGIN} className={cn(buttonVariants(), 'w-full')}>
            Ir para o login
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
