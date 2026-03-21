'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ROUTES } from '@/lib/constants/routes';
import Link from 'next/link';

const registerSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Informe um email válido'),
  password: z
    .string()
    .min(8, 'A senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'A senha deve conter: letra maiúscula, número e símbolo')
    .regex(/[0-9]/, 'A senha deve conter: letra maiúscula, número e símbolo')
    .regex(/[^a-zA-Z0-9]/, 'A senha deve conter: letra maiúscula, número e símbolo'),
  confirmPassword: z.string(),
  country: z.string().min(1, 'Selecione seu país'),
  timezone: z.string().min(1, 'Selecione seu fuso horário'),
  termsAccepted: z.boolean().refine((v) => v === true, {
    message: 'Você precisa aceitar os termos para continuar',
  }),
  marketingOptIn: z.boolean().optional(),
}).refine((d) => d.password === d.confirmPassword, {
  path: ['confirmPassword'],
  message: 'As senhas não coincidem',
});

type RegisterFormData = z.infer<typeof registerSchema>;

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (password.length >= 12) score++;
  if (score <= 1) return { score, label: 'Senha fraca', color: 'bg-destructive' };
  if (score === 2) return { score, label: 'Senha razoável', color: 'bg-warning' };
  if (score <= 4) return { score, label: 'Senha forte', color: 'bg-[#059669]' };
  return { score, label: 'Senha muito forte', color: 'bg-[#059669]' };
}

const COUNTRIES = ['Brasil', 'Estados Unidos', 'Portugal', 'Argentina', 'Itália', 'Outro'];
const TIMEZONES = [
  'America/Sao_Paulo', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Europe/Lisbon', 'Europe/Rome', 'America/Buenos_Aires', 'UTC',
];

export function RegisterForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { termsAccepted: false, marketingOptIn: false },
  });

  const password = watch('password', '');
  const strength = getPasswordStrength(password);

  // Auto-detect timezone
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) setValue('timezone', tz);
  }, [setValue]);

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    try {
      // TODO: Implementar backend
      throw new Error('Not implemented - run /auto-flow execute');
    } catch {
      toast.error('Ocorreu um erro inesperado. Tente novamente em alguns instantes.');
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
          className={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
          {...register('name')}
        />
        {errors.name && (
          <p className="text-xs text-destructive" role="alert">{errors.name.message}</p>
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
          className={errors.email ? 'border-destructive focus-visible:ring-destructive' : ''}
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-destructive" role="alert">{errors.email.message}</p>
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
            className={`pr-10 ${errors.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
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
        {password && (
          <div className="space-y-1">
            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                style={{ width: `${Math.min((strength.score / 5) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{strength.label}</p>
          </div>
        )}
        {errors.password && (
          <p className="text-xs text-destructive" role="alert">{errors.password.message}</p>
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
            className={`pr-10 ${errors.confirmPassword ? 'border-destructive focus-visible:ring-destructive' : ''}`}
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
          <p className="text-xs text-destructive" role="alert">{errors.confirmPassword.message}</p>
        )}
      </div>

      {/* País */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">País</Label>
        <Select onValueChange={(v) => setValue('country', v as string)} disabled={isLoading}>
          <SelectTrigger className={errors.country ? 'border-destructive' : ''}>
            <SelectValue placeholder="Selecione seu país" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.country && (
          <p className="text-xs text-destructive" role="alert">{errors.country.message}</p>
        )}
      </div>

      {/* Fuso horário */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Fuso horário</Label>
        <Select
          onValueChange={(v) => setValue('timezone', v as string)}
          defaultValue="America/Sao_Paulo"
          disabled={isLoading}
        >
          <SelectTrigger className={errors.timezone ? 'border-destructive' : ''}>
            <SelectValue placeholder="Detectando automaticamente..." />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.timezone && (
          <p className="text-xs text-destructive" role="alert">{errors.timezone.message}</p>
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
