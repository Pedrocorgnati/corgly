'use client';

import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES, API } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthPageWrapper } from '@/components/shared';

const schema = z.object({
  password: z
    .string()
    .min(8, 'A senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'A senha deve conter letra maiúscula, número e símbolo')
    .regex(/[0-9]/, 'A senha deve conter letra maiúscula, número e símbolo')
    .regex(/[^a-zA-Z0-9]/, 'A senha deve conter letra maiúscula, número e símbolo'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  path: ['confirmPassword'],
  message: 'As senhas não coincidem',
});

type FormData = z.infer<typeof schema>;

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  if (!token) {
    return (
      <AuthPageWrapper>
        <div className="w-full max-w-[384px]">
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Link inválido ou expirado</h1>
            <p className="text-sm text-muted-foreground">
              Este link de recuperação é inválido ou já expirou. Solicite um novo link.
            </p>
            <Link href={ROUTES.FORGOT_PASSWORD} className={cn(buttonVariants(), 'w-full')}>Solicitar novo link</Link>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  if (done) {
    return (
      <AuthPageWrapper>
        <div className="w-full max-w-[384px]">
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Senha redefinida!</h1>
            <p className="text-sm text-muted-foreground">
              Sua senha foi alterada com sucesso. Faça login com a nova senha.
            </p>
            <Link href={ROUTES.LOGIN} className={cn(buttonVariants(), 'w-full')}>Ir para o login</Link>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      await apiClient.post(API.AUTH.RESET_PASSWORD, {
        token,
        password: data.password,
      });
      toast.success('Senha redefinida com sucesso!');
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        toast.error('Token inválido ou expirado. Solicite um novo link.');
      } else {
        toast.error('Ocorreu um erro. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">Nova senha</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Crie uma senha forte para proteger sua conta.
            </p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">Nova senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  disabled={isLoading}
                  className="pr-10"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'reset-password-error' : undefined}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="reset-password-error" className="text-xs text-destructive" role="alert">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirmar senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Digite a nova senha novamente"
                  autoComplete="new-password"
                  disabled={isLoading}
                  className="pr-10"
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? 'reset-confirmPassword-error' : undefined}
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p id="reset-confirmPassword-error" className="text-xs text-destructive" role="alert">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full min-h-[48px]" disabled={isLoading}>
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>
              ) : (
                'Redefinir senha'
              )}
            </Button>
          </form>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-4">
          <Link href={ROUTES.LOGIN} className="text-primary font-medium hover:underline">
            ← Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
