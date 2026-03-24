'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES, API } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import { LoginSchema } from '@/schemas/auth.schema';

type LoginFormData = { email: string; password: string };

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(LoginSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const result = await apiClient.post<{
        data: {
          user: {
            id: string;
            name: string;
            role: string;
            onboardingCompletedAt: string | null;
          };
          token: string;
        };
      }>(API.AUTH.LOGIN, { email: data.email, password: data.password });

      toast.success('Login realizado com sucesso!');

      if (!result.data.user.onboardingCompletedAt) {
        router.push(ROUTES.ONBOARDING);
      } else {
        router.push(ROUTES.DASHBOARD);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setAuthError('Confirme seu email antes de fazer login.');
        } else if (err.status === 429) {
          setAuthError('Muitas tentativas. Aguarde um momento e tente novamente.');
        } else {
          setAuthError('Email ou senha incorretos. Verifique seus dados e tente novamente.');
        }
      } else {
        setAuthError('Erro de conexão. Verifique sua internet e tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-medium">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="email@exemplo.com"
          autoComplete="email"
          disabled={isLoading}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="email-error" className="text-xs text-destructive" role="alert">{errors.email.message}</p>
        )}
      </div>

      {/* Senha */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
          <Link
            href={ROUTES.FORGOT_PASSWORD}
            className="text-xs text-primary hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            disabled={isLoading}
            className="pr-10"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
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
          <p id="password-error" className="text-xs text-destructive" role="alert">{errors.password.message}</p>
        )}
      </div>

      {/* Auth error */}
      {authError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {authError}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        className="w-full min-h-[52px] bg-primary text-primary-foreground hover:bg-primary/90 font-semibold sticky bottom-4 md:static"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Entrando...
          </>
        ) : (
          'Entrar'
        )}
      </Button>
    </form>
  );
}
