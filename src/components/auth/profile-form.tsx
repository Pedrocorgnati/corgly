'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect } from 'react';
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

const LANGUAGES = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'es-ES', label: 'Español' },
  { value: 'it-IT', label: 'Italiano' },
];

const schema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  timezone: z.string().min(1, 'Selecione um fuso horário'),
  preferredLanguage: z.string().min(1, 'Selecione um idioma'),
});

type FormData = z.infer<typeof schema>;

export function ProfileForm() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [isSavingOptIn, setIsSavingOptIn] = useState(false);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      timezone: 'America/Sao_Paulo',
      preferredLanguage: 'pt-BR',
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
        preferredLanguage: (user as { preferredLanguage?: string }).preferredLanguage ?? 'pt-BR',
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
      toast.success(
        next
          ? 'Você receberá emails de marketing.'
          : 'Você não receberá mais emails de marketing.'
      );
    } catch {
      setMarketingOptIn(previous);
      toast.error('Não foi possível salvar sua preferência. Tente novamente.');
    } finally {
      setIsSavingOptIn(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      await apiClient.patch(API.PROFILE, data);
      toast.success('Perfil atualizado com sucesso.');
    } catch {
      toast.error('Erro ao salvar. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="space-y-6">
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
    <div className="space-y-6">
      {/* Profile section */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <AvatarInitials name={displayName} size="lg" />
          <div>
            <p className="font-semibold text-foreground">{displayName}</p>
            <p className="text-sm text-muted-foreground">{displayEmail}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome completo</Label>
            <Input
              id="name"
              disabled={isLoading}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'profile-name-error' : undefined}
              {...register('name')}
            />
            {errors.name && <p id="profile-name-error" className="text-xs text-destructive" role="alert">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={displayEmail} disabled readOnly className="opacity-60" />
            <p className="text-xs text-muted-foreground">O email não pode ser alterado.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-timezone">Fuso horário</Label>
            <Select
              defaultValue={user?.timezone ?? 'America/Sao_Paulo'}
              onValueChange={(v) => setValue('timezone', v ?? '')}
              disabled={isLoading}
            >
              <SelectTrigger id="profile-timezone">
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
            <Label htmlFor="profile-language">Idioma preferido</Label>
            <Select
              defaultValue="pt-BR"
              onValueChange={(v) => setValue('preferredLanguage', v ?? '')}
              disabled={isLoading}
            >
              <SelectTrigger id="profile-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</> : 'Salvar alterações'}
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="marketing-opt-in" className="text-sm font-medium">
                Receber emails de marketing
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Novidades, promoções e dicas. Você pode sair a qualquer momento.
              </p>
            </div>
            <Switch
              id="marketing-opt-in"
              checked={marketingOptIn}
              onCheckedChange={(value) => handleMarketingToggle(Boolean(value))}
              disabled={isSavingOptIn}
              aria-label="Receber emails de marketing"
            />
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-card border border-destructive/30 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold text-destructive mb-2">Zona de perigo</h3>
        <p className="text-sm text-muted-foreground mb-4">
          A exclusão da conta é permanente e não pode ser desfeita.
          Todos os seus dados e créditos restantes serão removidos.
        </p>
        <Button
          variant="destructive"
          size="sm"
          className="gap-2"
          onClick={() => setIsDeleteModalOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Excluir minha conta
        </Button>
      </div>

      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
}
