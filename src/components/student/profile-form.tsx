'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AvatarInitials } from '@/components/ui/avatar-initials';
import { Separator } from '@/components/ui/separator';

const TIMEZONES = [
  'America/Sao_Paulo', 'America/New_York', 'America/Chicago',
  'America/Los_Angeles', 'Europe/Lisbon', 'Europe/Rome', 'UTC',
];

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

// TODO: Replace with real user data from session
const MOCK_USER = { name: 'Ana Silva', email: 'ana@exemplo.com', timezone: 'America/Sao_Paulo', preferredLanguage: 'pt-BR' };

export function ProfileForm() {
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: MOCK_USER.name,
      timezone: MOCK_USER.timezone,
      preferredLanguage: MOCK_USER.preferredLanguage,
    },
  });

  const onSubmit = async (_data: FormData) => {
    setIsLoading(true);
    try {
      // TODO: Implementar backend — PATCH /api/v1/auth/profile
      await new Promise((r) => setTimeout(r, 500));
      toast.error('Não implementado — execute /auto-flow execute');
    } catch {
      toast.error('Erro ao salvar. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile section */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <AvatarInitials name={MOCK_USER.name} size="lg" />
          <div>
            <p className="font-semibold text-foreground">{MOCK_USER.name}</p>
            <p className="text-sm text-muted-foreground">{MOCK_USER.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome completo</Label>
            <Input
              id="name"
              disabled={isLoading}
              className={errors.name ? 'border-destructive' : ''}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-destructive" role="alert">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={MOCK_USER.email} disabled readOnly className="opacity-60" />
            <p className="text-xs text-muted-foreground">O email não pode ser alterado.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Fuso horário</Label>
            <Select
              defaultValue={MOCK_USER.timezone ?? undefined}
              onValueChange={(v) => setValue('timezone', v ?? '')}
              disabled={isLoading}
            >
              <SelectTrigger>
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
            <Label>Idioma preferido</Label>
            <Select
              defaultValue={MOCK_USER.preferredLanguage ?? undefined}
              onValueChange={(v) => setValue('preferredLanguage', v ?? '')}
              disabled={isLoading}
            >
              <SelectTrigger>
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
      </div>

      {/* Danger zone */}
      <div className="bg-card border border-destructive/30 rounded-2xl p-6 shadow-sm">
        <h3 className="font-semibold text-destructive mb-2">Zona de perigo</h3>
        <p className="text-sm text-muted-foreground mb-4">
          A exclusão da conta é permanente e não pode ser desfeita.
          Todos os seus dados e créditos restantes serão removidos.
        </p>
        <Button variant="destructive" size="sm" className="gap-2">
          <Trash2 className="h-4 w-4" />
          Excluir minha conta
        </Button>
      </div>
    </div>
  );
}
