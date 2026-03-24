'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES, API } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthPageWrapper } from '@/components/shared';
import { ResendConfirmationSchema } from '@/schemas/auth.schema';

type FormData = { email: string };

export default function ResendConfirmationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(ResendConfirmationSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      await apiClient.post(API.AUTH.RESEND_CONFIRMATION, { email: data.email });
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
      <AuthPageWrapper>
        <div className="w-full max-w-[384px]">
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <h2 className="text-base font-semibold text-foreground">Verifique seu email</h2>
            <p className="text-sm text-muted-foreground">
              Se este email estiver cadastrado e não confirmado, um novo link de confirmação foi enviado.
              Verifique também sua pasta de spam.
            </p>
            <Link
              href={ROUTES.LOGIN}
              className="block text-sm text-primary font-medium hover:underline mt-4"
            >
              Voltar para o login
            </Link>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">Reenviar confirmação</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Informe seu email para receber um novo link de confirmação.
            </p>
          </div>
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
                aria-describedby={errors.email ? 'resend-email-error' : undefined}
                {...register('email')}
              />
              {errors.email && (
                <p id="resend-email-error" className="text-xs text-destructive" role="alert">{errors.email.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full min-h-[44px]" disabled={isLoading}>
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando...</> : 'Reenviar link de confirmação'}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            <Link href={ROUTES.LOGIN} className="text-primary font-medium hover:underline">
              Voltar para o login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
