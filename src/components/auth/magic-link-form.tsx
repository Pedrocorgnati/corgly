'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, CheckCircle2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import { MagicLinkRequestSchema } from '@/schemas/auth.schema';

type FormData = { email: string };

/**
 * T-045 — Formulário de solicitação de magic-link (login sem senha).
 *
 * Estados de UI (AC5):
 *   - idle: formulário de email
 *   - loading: submit em andamento (botão com spinner + disabled)
 *   - sent: sucesso uniforme (mesma mensagem para email existente ou não)
 *   - rate-limited: limite atingido (429) — mensagem genérica
 *   - error: erro genérico de conexão/servidor
 */
export function MagicLinkForm() {
  // Ate 2026-09-07 toda a copy deste formulario (inclusive a constante de modulo
  // com a mensagem uniforme) era portugues cravado e ignorava o idioma do visitante.
  const t = useTranslations('auth.magicLink');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sent' | 'rate-limited' | 'error'>('idle');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(MagicLinkRequestSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      await apiClient.post(API.AUTH.MAGIC_LINK_REQUEST, { email: data.email });
      setStatus('sent');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setStatus('rate-limited');
      } else {
        setStatus('error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'sent') {
    return (
      <div data-testid="form-magic-link-success" className="text-center space-y-3 py-4" role="status">
        <MailCheck className="h-10 w-10 text-success mx-auto" />
        <h2 className="text-base font-semibold text-foreground">{t('sentTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('sentDesc')}
        </p>
      </div>
    );
  }

  if (status === 'rate-limited') {
    return (
      <div data-testid="form-magic-link-rate-limited" className="text-center space-y-3 py-4" role="alert">
        <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto" />
        <h2 className="text-base font-semibold text-foreground">{t('rateLimitTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('rateLimitDesc')}
        </p>
        <Button
          data-testid="form-magic-link-back-button"
          type="button"
          variant="outline"
          className="w-full min-h-[44px]"
          onClick={() => setStatus('idle')}
        >
          {t('back')}
        </Button>
      </div>
    );
  }

  return (
    <form data-testid="form-magic-link" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {status === 'error' && (
        <p data-testid="form-magic-link-error" className="text-sm text-destructive text-center" role="alert">
          {t('sendError')}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-medium">
          {t('emailLabel')}
        </Label>
        <Input
          data-testid="form-magic-link-email-input"
          id="email"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          disabled={isLoading}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'magic-link-email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="magic-link-email-error" className="text-xs text-destructive" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>
      <Button data-testid="form-magic-link-submit-button" type="submit" className="w-full min-h-[44px]" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            {t('sending')}
          </>
        ) : (
          t('submit')
        )}
      </Button>
    </form>
  );
}
