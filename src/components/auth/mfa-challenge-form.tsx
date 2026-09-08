'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API, ROUTES } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import { withRedirectTo } from '@/lib/auth/safe-redirect';
import { describeMfaApiError } from './mfa-messages';

interface Props {
  /** Destino apos a verificacao. Ja sanitizado pela pagina servidor. */
  redirectTo: string;
}

/**
 * Formulario da verificacao em duas etapas (step-up) do admin.
 * Sad paths: 401 (sessao expirada -> login), 409 (MFA nao cadastrado -> link
 * para o setup), 400 (codigo invalido/replay), 429 (rate limit), timeout e rede.
 */
export function MfaChallengeForm({ redirectTo }: Props) {
  // Ate 2026-09-07 esta copy (inclusive as tres constantes de modulo) era
  // portugues cravado e ignorava o idioma escolhido pelo usuario.
  const t = useTranslations('auth.mfa');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notEnrolled, setNotEnrolled] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setNotEnrolled(false);

    try {
      await apiClient.post(
        API.AUTH.MFA_VERIFY,
        { code: code.trim() },
        { skipAuthRedirect: true },
      );
      toast.success(t('challengeDoneToast'));
      // Mantem o formulario desabilitado ate a navegacao desmontar o componente.
      router.replace(redirectTo);
    } catch (err) {
      setIsSubmitting(false);

      if (err instanceof ApiError && err.status === 401) {
        toast.error(t('sessionExpired'));
        router.replace(withRedirectTo(ROUTES.LOGIN, redirectTo));
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        setNotEnrolled(true);
        setError(t('notEnrolled'));
        return;
      }

      setError(describeMfaApiError(err, t('invalidCode'), t));
    }
  }

  return (
    <form
      data-testid="form-mfa-challenge"
      onSubmit={handleSubmit}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="mfa-code" className="text-sm font-medium">
          {t('challengeCodeLabel')}
        </Label>
        <Input
          data-testid="form-mfa-challenge-code-input"
          id="mfa-code"
          // text (nao numeric): codigos de recuperacao tem letras e o teclado
          // numerico do iOS nao permite digita-los.
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          maxLength={32}
          value={code}
          disabled={isSubmitting}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? 'mfa-challenge-error' : 'mfa-challenge-hint'}
        />
        <p id="mfa-challenge-hint" className="text-xs text-muted-foreground">
          {t('challengeHint')}
        </p>
        {error && (
          <p id="mfa-challenge-error" className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {notEnrolled && (
          <Link
            data-testid="form-mfa-challenge-setup-link"
            href={withRedirectTo(ROUTES.MFA_SETUP, redirectTo)}
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            {t('challengeSetupLink')}
          </Link>
        )}
      </div>

      <Button
        data-testid="form-mfa-challenge-submit-button"
        type="submit"
        className="w-full"
        disabled={isSubmitting || code.trim().length < 6}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('verifying')}
          </>
        ) : (
          t('verify')
        )}
      </Button>
    </form>
  );
}
