'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AvatarInitials } from '@/components/ui/avatar-initials';
import { DeleteAccountModal } from '@/components/auth/delete-account-modal';
import { apiClient } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import { TIMEZONES } from '@/lib/constants/geo';

/**
 * Endonimos: cada idioma se apresenta na propria lingua, entao esta lista NAO
 * passa pelo catalogo — traduzi-la faria o menu mostrar "Portuguese" para quem
 * ja escolheu ingles, escondendo justamente a opcao que a pessoa procura.
 *
 * Os valores seguem o enum `SupportedLanguage` do backend (PT_BR) — o mesmo
 * formato de `user.preferredLanguage` e do `UpdateProfileSchema`. A lista em
 * formato `pt-BR` quebrava o select (valor fora das opcoes) e era rejeitada
 * pela API na hora de salvar.
 */
const LANGUAGES = [
  { value: 'PT_BR', label: 'Português (Brasil)' },
  { value: 'EN_US', label: 'English (US)' },
  { value: 'ES_ES', label: 'Español' },
  { value: 'IT_IT', label: 'Italiano' },
];

/**
 * Ate 2026-09-07 as tres mensagens de validacao eram portugues cravado numa
 * constante de modulo — fora do alcance do next-intl. Agora o schema nasce
 * dentro do componente, com o tradutor do leitor.
 */
const buildSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(2, t('nameMin')),
    timezone: z.string().min(1, t('timezoneRequired')),
    preferredLanguage: z.string().min(1, t('languageRequired')),
  });

type FormData = z.infer<ReturnType<typeof buildSchema>>;

export function ProfileForm() {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo usuario — inclusive nesta tela, onde ele TROCA o idioma.
  const t = useTranslations('auth.profile');
  const { user, isLoading: isAuthLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [isSavingOptIn, setIsSavingOptIn] = useState(false);

  const schema = useMemo(() => buildSchema(t), [t]);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      timezone: 'America/Sao_Paulo',
      preferredLanguage: 'EN_US',
    },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  // Populate form when user data loads
  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        timezone: user.timezone ?? 'America/Sao_Paulo',
        preferredLanguage: (user as { preferredLanguage?: string }).preferredLanguage ?? 'EN_US',
      });
      setMarketingOptIn(Boolean((user as { marketingOptIn?: boolean }).marketingOptIn));
    }
  }, [user, reset]);

  const handleMarketingToggle = async (next: boolean) => {
    const previous = marketingOptIn;
    setMarketingOptIn(next);
    setIsSavingOptIn(true);
    try {
      await apiClient.put(API.PROFILE_MARKETING_OPT_IN, { optIn: next });
      toast.success(next ? t('marketingOnToast') : t('marketingOffToast'));
    } catch {
      setMarketingOptIn(previous);
      toast.error(t('marketingErrorToast'));
    } finally {
      setIsSavingOptIn(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      await apiClient.patch(API.PROFILE, data);
      toast.success(t('savedToast'));
    } catch {
      toast.error(t('saveErrorToast'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div data-testid="profile-loading" className="space-y-6">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  const displayName = user?.name ?? '';
  const displayEmail = user?.email ?? '';

  return (
    <div data-testid="profile-sections" className="space-y-6">
      {/* Profile section */}
      <div data-testid="profile-personal-section" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div data-testid="profile-identity" className="flex items-center gap-4 mb-6">
          <AvatarInitials name={displayName} size="lg" />
          <div>
            <p className="font-semibold text-foreground">{displayName}</p>
            <p className="text-sm text-muted-foreground">{displayEmail}</p>
          </div>
        </div>

        <form data-testid="form-profile" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">{t('nameLabel')}</Label>
            <Input
              data-testid="form-profile-name-input"
              id="name"
              disabled={isLoading}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'profile-name-error' : undefined}
              {...register('name')}
            />
            {errors.name && <p data-testid="form-profile-name-error" id="profile-name-error" className="text-xs text-destructive" role="alert">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">{t('emailLabel')}</Label>
            <Input data-testid="form-profile-email-input" id="email" value={displayEmail} disabled readOnly className="opacity-60" />
            <p className="text-xs text-muted-foreground">{t('emailLocked')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-timezone">{t('timezoneLabel')}</Label>
            <Select
              defaultValue={user?.timezone ?? 'America/Sao_Paulo'}
              onValueChange={(v) => setValue('timezone', v ?? '')}
              disabled={isLoading}
            >
              <SelectTrigger data-testid="form-profile-timezone-select" id="profile-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-language">{t('languageLabel')}</Label>
            {/*
              O default vinha cravado em 'pt-BR' e o menu exibia "Portugues (Brasil)"
              mesmo para quem ja tinha salvo outro idioma. Como o componente so
              chega aqui depois de `isAuthLoading`, o usuario ja esta carregado e o
              valor real pode entrar no primeiro render.
            */}
            <Select
              defaultValue={
                (user as { preferredLanguage?: string } | null)?.preferredLanguage ?? 'EN_US'
              }
              onValueChange={(v) => setValue('preferredLanguage', v ?? '')}
              disabled={isLoading}
            >
              <SelectTrigger data-testid="form-profile-language-select" id="profile-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button data-testid="form-profile-submit-button" type="submit" disabled={isLoading} className="w-full">
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t('saving')}</> : t('save')}
          </Button>
        </form>

        <div data-testid="profile-marketing-opt-in" className="mt-6 pt-6 border-t border-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="marketing-opt-in" className="text-sm font-medium">
                {t('marketingLabel')}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('marketingDesc')}
              </p>
            </div>
            <Switch
              data-testid="profile-marketing-opt-in-switch"
              id="marketing-opt-in"
              checked={marketingOptIn}
              onCheckedChange={(value) => handleMarketingToggle(Boolean(value))}
              disabled={isSavingOptIn}
              aria-label={t('marketingLabel')}
            />
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div data-testid="profile-danger-zone" className="bg-card border border-destructive/30 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold text-destructive mb-2">{t('dangerTitle')}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t('dangerDesc')}
        </p>
        <Button
          data-testid="profile-delete-account-button"
          variant="destructive"
          size="sm"
          className="gap-2"
          onClick={() => setIsDeleteModalOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          {t('deleteAccount')}
        </Button>
      </div>

      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
}
