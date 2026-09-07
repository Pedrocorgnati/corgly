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
import { resolvePostLoginDestination } from '@/lib/auth/post-login-destination';
import { planSelectionQuery, readPlanSelection } from '@/lib/constants/landing';
import { LoginSchema } from '@/schemas/auth.schema';

type LoginFormData = { email: string; password: string };

/**
 * Le `?redirectTo=` da URL corrente.
 *
 * O proxy escreve esse parametro ao barrar usuario sem sessao vindo de /admin/*
 * (src/proxy.ts). O formulario ignorava o valor: o admin logava e caia no
 * destino padrao, perdendo a pagina que pediu.
 *
 * Lemos de `window.location` em vez de `useSearchParams()` de proposito: a
 * pagina de login e estatica e o hook exigiria um <Suspense> em volta do
 * formulario (arquivo de outro dono). Aqui o valor so e necessario no submit,
 * que e sempre client-side.
 *
 * O valor cru NUNCA e usado: `resolvePostLoginDestination` o passa por
 * `sanitizeAdminRedirectTo`, que rejeita host externo, `//`, barra invertida e
 * qualquer path fora de /admin/* (anti open redirect).
 */
function readRedirectToParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('redirectTo');
}

/**
 * Ultimo elo faltante da ponte landing -> cadastro -> vitrine.
 *
 * Quem clica num plano da landing sem sessao vai para `/auth/register`, que
 * guarda a escolha (`savePlanSelection`, em `register-form.tsx`) ja na abertura
 * da pagina — inclusive para quem ja tem conta e desce ate "Entrar". Ate aqui a
 * escolha so era recuperada se a pessoa, por conta propria, chegasse em
 * `/credits`: quem ja tinha onboarding concluido caia no dashboard e a escolha
 * ficava encalhada ate expirar. Agora o login leva essa pessoa para a vitrine
 * com o plano na query, onde `PricingCards` aplica a selecao e apaga o registro.
 *
 * Nao toca nos outros destinos DE PROPOSITO: onboarding pendente continua
 * vencendo (o funil do aluno novo ja termina em `/credits` pelo
 * equipment-check) e admin nunca e desviado do `redirectTo` sanitizado.
 *
 * FICA DE FORA o callback de magic-link (`src/app/(public)/auth/magic-link/
 * page.tsx`): ele e server component e resolve o destino antes de existir
 * qualquer `window`, logo nao tem como ler o registro. Quem entra por link
 * segue caindo no dashboard e recupera a escolha ao abrir `/credits`.
 */
function applyPlanSelectionDetour(destination: string): string {
  if (destination !== ROUTES.DASHBOARD) return destination;
  const saved = readPlanSelection();
  if (!saved) return destination;
  return `${ROUTES.CREDITS}?${planSelectionQuery(saved)}`;
}

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

      // Ponto unico de decisao, compartilhado com o callback de magic-link:
      // admin vai para o painel (honrando o redirectTo sanitizado), aluno sem
      // onboarding vai para o onboarding, o resto vai para o dashboard.
      const { role, onboardingCompletedAt } = result.data.user;

      router.push(
        applyPlanSelectionDetour(
          resolvePostLoginDestination({ role, onboardingCompletedAt }, readRedirectToParam()),
        ),
      );
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
    <form data-testid="form-login" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-medium">Email</Label>
        <Input
          data-testid="form-login-email-input"
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
            data-testid="form-login-forgot-password-link"
            className="text-xs text-primary hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>
        <div className="relative">
          <Input
            data-testid="form-login-password-input"
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
            data-testid="form-login-toggle-password-button"
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
          data-testid="form-login-error"
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {authError}
        </div>
      )}

      {/* Submit */}
      <Button
        data-testid="form-login-submit-button"
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
