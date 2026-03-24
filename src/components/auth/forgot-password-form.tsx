'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import { ForgotPasswordSchema } from '@/schemas/auth.schema';

type FormData = { email: string };

export function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(ForgotPasswordSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      await apiClient.post(API.AUTH.FORGOT_PASSWORD, { email: data.email });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast.error('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      } else {
        // Always show success to prevent user enumeration
        setSent(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center space-y-3 py-4">
        <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
        <h2 className="text-base font-semibold text-foreground">Verifique seu email</h2>
        <p className="text-sm text-muted-foreground">
          Se o email estiver cadastrado, você receberá um link de recuperação.
          Verifique também sua pasta de spam.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-medium">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          disabled={isLoading}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'forgot-email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="forgot-email-error" className="text-xs text-destructive" role="alert">{errors.email.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full min-h-[44px]" disabled={isLoading}>
        {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando...</> : 'Enviar link de recuperação'}
      </Button>
    </form>
  );
}
