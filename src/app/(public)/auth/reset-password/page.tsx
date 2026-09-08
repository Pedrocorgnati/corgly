'use client';

import { Suspense, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

/**
 * Ate 2026-09-07 as quatro mensagens de validacao eram portugues cravado numa
 * constante de modulo — fora do alcance do next-intl. Agora o schema nasce
 * dentro do componente, com o tradutor do leitor.
 */
const buildSchema = (t: (key: string) => string) =>
  z
    .object({
      password: z
        .string()
        .min(8, t('passwordMin'))
        .regex(/[A-Z]/, t('passwordComplexity'))
        .regex(/[0-9]/, t('passwordComplexity'))
        .regex(/[^a-zA-Z0-9]/, t('passwordComplexity')),
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      path: ['confirmPassword'],
      message: t('passwordMismatch'),
    });

type FormData = z.infer<ReturnType<typeof buildSchema>>;

function ResetPasswordContent() {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo usuario.
  const t = useTranslations('pages.auth.resetPassword');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const schema = useMemo(() => buildSchema(t), [t]);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  if (!token) {
    return (
      <AuthPageWrapper>
        <div data-testid="page-auth-reset-password" className="w-full max-w-[384px]">
          <div data-testid="auth-reset-password-no-token" className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">{t('invalidTitle')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('invalidDesc')}
            </p>
            <Link data-testid="auth-reset-password-forgot-link" href={ROUTES.FORGOT_PASSWORD} className={cn(buttonVariants(), 'w-full')}>{t('requestNew')}</Link>
          </div>
        </div>
      </AuthPageWrapper>
    );
  }

  if (done) {
    return (
      <AuthPageWrapper>
        <div data-testid="page-auth-reset-password" className="w-full max-w-[384px]">
          <div data-testid="auth-reset-password-success" className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
            <h1 className="text-xl font-bold text-foreground">{t('successTitle')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('successDesc')}
            </p>
            <Link data-testid="auth-reset-password-login-link" href={ROUTES.LOGIN} className={cn(buttonVariants(), 'w-full')}>{t('goToLogin')}</Link>
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
      toast.success(t('successToast'));
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        toast.error(t('invalidTokenToast'));
      } else {
        toast.error(t('genericErrorToast'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div data-testid="page-auth-reset-password" className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center py-8 px-4">
      <div className="w-full max-w-[384px]">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg">
          <div data-testid="auth-reset-password-header" className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('subtitle')}
            </p>
          </div>
          <form data-testid="form-reset-password" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">{t('passwordLabel')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  data-testid="form-reset-password-password-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('passwordPlaceholder')}
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
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="reset-password-error" className="text-xs text-destructive" role="alert">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">{t('confirmLabel')}</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  data-testid="form-reset-password-confirm-password-input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder={t('confirmPlaceholder')}
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
                  aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p id="reset-confirmPassword-error" className="text-xs text-destructive" role="alert">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" data-testid="form-reset-password-submit-button" className="w-full min-h-[48px]" disabled={isLoading}>
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('saving')}</>
              ) : (
                t('submit')
              )}
            </Button>
          </form>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-4">
          <Link data-testid="auth-reset-password-login-link" href={ROUTES.LOGIN} className="text-primary font-medium hover:underline">
            {t('backToLogin')}
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
