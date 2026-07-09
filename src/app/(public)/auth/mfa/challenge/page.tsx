'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const MFA_VERIFY_URL = '/api/v1/auth/mfa/verify';
const SAFE_FALLBACK = '/admin';
const HOME_FALLBACK = '/';

function isSafeRedirectTo(redirectTo: string | null): boolean {
  if (!redirectTo) return false;
  // Aceitar apenas paths relativos internos; rejeitar URLs externas e protocolo js:
  return redirectTo.startsWith('/') && !redirectTo.startsWith('//');
}

export default function MfaChallengeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Auto-focus no input ao montar
  useEffect(() => {
    document.getElementById('mfa-code')?.focus();
  }, []);

  const safeRedirect = isSafeRedirectTo(redirectTo) ? redirectTo! : SAFE_FALLBACK;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = code.replace(/\s/g, '');
    if (trimmed.length === 0) {
      setError('Informe o codigo de 6 digitos ou um codigo de recuperacao.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(MFA_VERIFY_URL, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trimmed }),
        });

        if (res.ok) {
          // JWT reemitido com mfaAt atualizado — redirecionar para destino
          router.replace(safeRedirect);
          return;
        }

        const data = await res.json().catch(() => ({}));
        setError(
          data?.error ?? 'Codigo invalido. Verifique e tente novamente.',
        );
      } catch {
        setError('Falha de conexao. Tente novamente.');
      }
    });
  }

  function handleCancel() {
    router.replace(HOME_FALLBACK);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              Verificacao em duas etapas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Informe o codigo do seu aplicativo autenticador ou um codigo de
              recuperacao para continuar.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="mfa-code"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Codigo
              </label>
              <input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isPending}
                maxLength={32}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
            </div>

            {/* Estado de erro: feedback explicito (Zero Silencio) */}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Verificando...' : 'Verificar'}
            </button>
          </form>

          <button
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar e voltar ao inicio
          </button>
        </div>
      </div>
    </div>
  );
}
