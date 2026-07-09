'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ROUTES, API } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  LeadFormFieldsSchema,
  LEAD_HONEYPOT_FIELD,
  type LeadFormFields,
  type LeadOriginValue,
  type LeadLocaleValue,
} from '@/lib/leads/lead.schema';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Resolve o locale do navegador para o enum do backend. Lê o cookie de
 * preferência (`corgly_locale`) primeiro, depois `navigator.language`.
 */
function detectClientLocale(): LeadLocaleValue {
  if (typeof document !== 'undefined') {
    const cookie = document.cookie
      .split('; ')
      .find((c) => c.startsWith('corgly_locale='))
      ?.split('=')[1];
    const raw = (cookie ?? (typeof navigator !== 'undefined' ? navigator.language : '') ?? '').toLowerCase();
    if (raw.startsWith('pt')) return 'PT_BR';
    if (raw.startsWith('es')) return 'ES_ES';
    if (raw.startsWith('it')) return 'IT_IT';
    if (raw.startsWith('en')) return 'EN_US';
  }
  return 'PT_BR';
}

interface TurnstileWindow extends Window {
  turnstile?: {
    render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void }) => string;
    remove: (id: string) => void;
  };
}

export interface LeadFormProps {
  /** Origem do lead — define qual formulário o originou (mesmo endpoint). */
  origin: LeadOriginValue;
  /** Exibe o campo de mensagem (default: true). Landing pode esconder. */
  showMessage?: boolean;
  /** Rótulo do botão de envio. */
  submitLabel?: string;
  className?: string;
}

/**
 * Formulário público de captação de leads (T-053 / §12.4.3).
 * Reutilizável por landing, página do método e contato — todos postam para
 * `POST /api/v1/leads` com a mesma forma de payload.
 *
 * Defesas: honeypot (`website`), consentimento explícito obrigatório e captcha
 * Turnstile opcional (renderizado só quando `NEXT_PUBLIC_TURNSTILE_SITE_KEY`).
 */
export function LeadForm({ origin, showMessage = true, submitLabel = 'Enviar', className }: LeadFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const honeypotRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LeadFormFields>({
    resolver: zodResolver(LeadFormFieldsSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { consentGiven: false },
  });

  // Turnstile opcional: monta o widget apenas quando há site key configurada.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !captchaRef.current) return;
    const scriptId = 'cf-turnstile-script';
    let widgetId: string | undefined;

    function renderWidget() {
      const w = window as TurnstileWindow;
      if (!w.turnstile || !captchaRef.current) return;
      widgetId = w.turnstile.render(captchaRef.current, {
        sitekey: TURNSTILE_SITE_KEY!,
        callback: (token: string) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(null),
      });
    }

    if (document.getElementById(scriptId)) {
      renderWidget();
    } else {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.onload = renderWidget;
      document.head.appendChild(s);
    }

    return () => {
      const w = window as TurnstileWindow;
      if (widgetId && w.turnstile) w.turnstile.remove(widgetId);
    };
  }, []);

  const onSubmit = async (data: LeadFormFields) => {
    setFormError(null);

    // Captcha obrigatório só quando o widget está configurado.
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setFormError('Confirme que você não é um robô para enviar.');
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.post(API.LEADS, {
        origin,
        email: data.email,
        name: data.name || undefined,
        message: data.message || undefined,
        locale: detectClientLocale(),
        consentGiven: data.consentGiven,
        captchaToken: captchaToken ?? undefined,
        // honeypot: enviado cru; humanos deixam vazio.
        [LEAD_HONEYPOT_FIELD]: honeypotRef.current?.value ?? '',
      });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setFormError('Muitas tentativas. Aguarde um momento e tente novamente.');
      } else if (err instanceof ApiError && err.message) {
        setFormError(err.message);
      } else {
        setFormError('Não foi possível enviar agora. Tente novamente em instantes.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className={`text-center space-y-3 py-6 ${className ?? ''}`} role="status">
        <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
        <h2 className="text-base font-semibold text-foreground">Mensagem enviada!</h2>
        <p className="text-sm text-muted-foreground">
          Recebemos seu contato e retornaremos em breve. Verifique também sua pasta de spam.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={`space-y-4 ${className ?? ''}`} noValidate>
      {/* Honeypot — escondido de humanos, ignorado por leitores de tela. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${origin}-website`}>Não preencha este campo</label>
        <input
          ref={honeypotRef}
          id={`${origin}-website`}
          name={LEAD_HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${origin}-name`} className="text-sm font-medium">Nome</Label>
        <Input
          id={`${origin}-name`}
          type="text"
          placeholder="Seu nome"
          autoComplete="name"
          disabled={isLoading}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${origin}-name-error` : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id={`${origin}-name-error`} className="text-xs text-destructive" role="alert">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${origin}-email`} className="text-sm font-medium">Email</Label>
        <Input
          id={`${origin}-email`}
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          disabled={isLoading}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? `${origin}-email-error` : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id={`${origin}-email-error`} className="text-xs text-destructive" role="alert">{errors.email.message}</p>
        )}
      </div>

      {showMessage && (
        <div className="space-y-1.5">
          <Label htmlFor={`${origin}-message`} className="text-sm font-medium">Mensagem</Label>
          <Textarea
            id={`${origin}-message`}
            placeholder="Como podemos ajudar?"
            rows={4}
            disabled={isLoading}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? `${origin}-message-error` : undefined}
            {...register('message')}
          />
          {errors.message && (
            <p id={`${origin}-message-error`} className="text-xs text-destructive" role="alert">{errors.message.message}</p>
          )}
        </div>
      )}

      {/* Consentimento de marketing EXPLÍCITO (obrigatório). */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-start gap-3">
          <Checkbox
            id={`${origin}-consent`}
            disabled={isLoading}
            onCheckedChange={(v) => setValue('consentGiven', v === true, { shouldValidate: true })}
            className="mt-0.5 min-h-[24px] min-w-[24px]"
          />
          <Label htmlFor={`${origin}-consent`} className="text-sm text-muted-foreground cursor-pointer leading-relaxed">
            Autorizo o contato e o tratamento dos meus dados conforme a{' '}
            <Link href={ROUTES.PRIVACY} target="_blank" className="text-primary underline hover:no-underline">
              Política de Privacidade
            </Link>{' '}
            e a LGPD (Lei nº 13.709/2018)
          </Label>
        </div>
        {errors.consentGiven && (
          <p className="text-xs text-destructive" role="alert">{errors.consentGiven.message}</p>
        )}
      </div>

      {TURNSTILE_SITE_KEY && <div ref={captchaRef} className="min-h-[65px]" />}

      {formError && (
        <p className="text-sm text-destructive" role="alert">{formError}</p>
      )}

      <Button type="submit" className="w-full min-h-[44px]" disabled={isLoading}>
        {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando...</> : submitLabel}
      </Button>
    </form>
  );
}
