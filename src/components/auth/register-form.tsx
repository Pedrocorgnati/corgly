'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROUTES, API } from '@/lib/constants/routes';
import { COUNTRIES, TIMEZONES } from '@/lib/constants/geo';
import { apiClient, ApiError } from '@/lib/api-client';
import { RegisterFormSchema, type RegisterFormInput } from '@/schemas/auth.schema';
import { PasswordStrengthMeter } from '@/components/auth/password-strength-meter';
import Link from 'next/link';

export function RegisterForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<RegisterFormInput>({
    resolver: zodResolver(RegisterFormSchema),
    defaultValues: { termsAccepted: false, privacyAccepted: false, marketingOptIn: false },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const password = watch('password', '');

  // Auto-detect timezone
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) setValue('timezone', tz);
  }, [setValue]);

  const onSubmit = async (data: RegisterFormInput) => {
    setIsLoading(true);
    try {
      await apiClient.post(API.AUTH.REGISTER, {
        name: data.name,
        email: data.email,
        password: data.password,
        country: data.country,
        timezone: data.timezone,
        termsAccepted: data.termsAccepted,
        privacyAccepted: data.privacyAccepted,
        marketingOptIn: data.marketingOptIn ?? false,
      });

      toast.success('Conta criada! Verifique seu email para confirmar.');
      router.push(ROUTES.CONFIRM_EMAIL);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          toast.error('Este email já está cadastrado. Tente fazer login.');
        } else if (err.status === 429) {
          toast.error('Muitas tentativas. Aguarde e tente novamente.');
        } else {
          toast.error(err.message || 'Ocorreu um erro inesperado. Tente novamente em alguns instantes.');
        }
      } else {
        toast.error('Erro de conexão. Verifique sua internet e tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {/* Nome */}
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-sm font-medium">Nome completo</Label>
        <Input
          id="name"
          type="text"
          placeholder="João Silva"
          autoComplete="name"
          disabled={isLoading}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'name-error' : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id="name-error" className="text-xs text-destructive" role="alert">{errors.name.message}</p>
        )}
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-medium">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="joao@exemplo.com"
          autoComplete="email"
          disabled={isLoading}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'reg-email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="reg-email-error" className="text-xs text-destructive" role="alert">{errors.email.message}</p>
        )}
      </div>

      {/* Senha */}
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            disabled={isLoading}
            className="pr-10"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'reg-password-error' : undefined}
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
        {/* Strength meter */}
        <PasswordStrengthMeter password={password} />
        {errors.password && (
          <p id="reg-password-error" className="text-xs text-destructive" role="alert">{errors.password.message}</p>
        )}
      </div>

      {/* Confirmar senha */}
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirmar senha</Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="Digite a senha novamente"
            autoComplete="new-password"
            disabled={isLoading}
            className="pr-10"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? 'reg-confirmPassword-error' : undefined}
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
          <p id="reg-confirmPassword-error" className="text-xs text-destructive" role="alert">{errors.confirmPassword.message}</p>
        )}
      </div>

      {/* País */}
      <div className="space-y-1.5">
        <Label htmlFor="country" className="text-sm font-medium">País</Label>
        <Select onValueChange={(v) => setValue('country', v as string)} disabled={isLoading}>
          <SelectTrigger
            id="country"
            aria-invalid={!!errors.country}
            aria-describedby={errors.country ? 'country-error' : undefined}
            className={errors.country ? 'border-destructive' : ''}
          >
            <SelectValue placeholder="Selecione seu país" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.country && (
          <p id="country-error" className="text-xs text-destructive" role="alert">{errors.country.message}</p>
        )}
      </div>

      {/* Fuso horário */}
      <div className="space-y-1.5">
        <Label htmlFor="timezone" className="text-sm font-medium">Fuso horário</Label>
        <Select
          onValueChange={(v) => setValue('timezone', v as string)}
          defaultValue="America/Sao_Paulo"
          disabled={isLoading}
        >
          <SelectTrigger
            id="timezone"
            aria-invalid={!!errors.timezone}
            aria-describedby={errors.timezone ? 'timezone-error' : undefined}
            className={errors.timezone ? 'border-destructive' : ''}
          >
            <SelectValue placeholder="Detectando automaticamente..." />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.timezone && (
          <p id="timezone-error" className="text-xs text-destructive" role="alert">{errors.timezone.message}</p>
        )}
      </div>

      {/* Termos */}
      <div className="space-y-3 pt-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id="termsAccepted"
            disabled={isLoading}
            onCheckedChange={(v) => setValue('termsAccepted', v === true)}
            className="mt-0.5 min-h-[24px] min-w-[24px]"
          />
          <Label htmlFor="termsAccepted" className="text-sm text-foreground cursor-pointer leading-relaxed">
            Li e aceito os{' '}
            <Link href={ROUTES.TERMS} target="_blank" className="text-primary underline hover:no-underline">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link href={ROUTES.PRIVACY} target="_blank" className="text-primary underline hover:no-underline">
              Política de Privacidade
            </Link>
          </Label>
        </div>
        {errors.termsAccepted && (
          <p className="text-xs text-destructive" role="alert">{errors.termsAccepted.message}</p>
        )}

        <div className="flex items-start gap-3">
          <Checkbox
            id="privacyAccepted"
            disabled={isLoading}
            onCheckedChange={(v) => setValue('privacyAccepted', v === true)}
            className="mt-0.5 min-h-[24px] min-w-[24px]"
          />
          <Label htmlFor="privacyAccepted" className="text-sm text-foreground cursor-pointer leading-relaxed">
            Autorizo o tratamento dos meus dados pessoais conforme a{' '}
            <Link href={ROUTES.PRIVACY} target="_blank" className="text-primary underline hover:no-underline">
              Política de Privacidade
            </Link>{' '}
            e a LGPD (Lei nº 13.709/2018)
          </Label>
        </div>
        {errors.privacyAccepted && (
          <p className="text-xs text-destructive" role="alert">{errors.privacyAccepted.message}</p>
        )}

        <div className="flex items-start gap-3">
          <Checkbox
            id="marketingOptIn"
            disabled={isLoading}
            onCheckedChange={(v) => setValue('marketingOptIn', v === true)}
            className="mt-0.5 min-h-[24px] min-w-[24px]"
          />
          <Label htmlFor="marketingOptIn" className="text-sm text-muted-foreground cursor-pointer leading-relaxed">
            Aceito receber novidades e dicas de aprendizado por email
          </Label>
        </div>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        className="w-full min-h-[52px] md:min-h-[40px] bg-primary text-primary-foreground hover:bg-primary/90 font-semibold sticky bottom-4 md:static shadow-lg md:shadow-none"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Criando conta...
          </>
        ) : (
          'Criar Conta'
        )}
      </Button>
    </form>
  );
}
