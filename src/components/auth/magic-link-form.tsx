'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, CheckCircle2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import { MagicLinkRequestSchema } from '@/schemas/auth.schema';

type FormData = { email: string };

/** Mensagem uniforme — espelha a do backend (anti-enumeração, AC4). */
const UNIFORM_MESSAGE =
  'Se este email estiver cadastrado, você receberá um link de acesso.';

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
      <div className="text-center space-y-3 py-4" role="status">
        <MailCheck className="h-10 w-10 text-success mx-auto" />
        <h2 className="text-base font-semibold text-foreground">Verifique seu email</h2>
        <p className="text-sm text-muted-foreground">
          {UNIFORM_MESSAGE} O link expira em 15 minutos. Verifique também sua pasta de spam.
        </p>
      </div>
    );
  }

  if (status === 'rate-limited') {
    return (
      <div className="text-center space-y-3 py-4" role="alert">
        <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto" />
        <h2 className="text-base font-semibold text-foreground">Muitas solicitações</h2>
        <p className="text-sm text-muted-foreground">
          Você atingiu o limite de solicitações. Aguarde alguns minutos antes de tentar novamente.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full min-h-[44px]"
          onClick={() => setStatus('idle')}
        >
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {status === 'error' && (
        <p className="text-sm text-destructive text-center" role="alert">
          Não foi possível enviar o link. Verifique sua conexão e tente novamente.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-medium">
          Email
        </Label>
        <Input
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
      <Button type="submit" className="w-full min-h-[44px]" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Enviando...
          </>
        ) : (
          'Enviar link de acesso'
        )}
      </Button>
    </form>
  );
}
