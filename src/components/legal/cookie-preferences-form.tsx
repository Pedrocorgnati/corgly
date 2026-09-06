'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { API } from '@/lib/constants/routes';
import {
  getConsentCookie,
  setConsentCookie,
  parseConsentCookie,
  serializeConsent,
  type ConsentChoice,
} from '@/lib/legal/consent-cookie';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** Chaves de categoria que o usuario pode alternar (necessary e sempre true). */
type ToggleableCategory = 'analytics' | 'marketing';

interface CategoryDef {
  key: 'necessary' | ToggleableCategory;
  label: string;
  description: string;
  locked: boolean;
}

const CATEGORIES: readonly CategoryDef[] = [
  {
    key: 'necessary',
    label: 'Essenciais',
    description: 'Necessários para autenticação, segurança e funcionamento do site. Sempre ativos.',
    locked: true,
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'Nos ajudam a entender o uso do site para melhorar a experiência.',
    locked: false,
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Permitem personalizar conteúdo e medir campanhas.',
    locked: false,
  },
];

export function CookiePreferencesForm() {
  const [state, setState] = React.useState<ConsentChoice>({ analytics: false, marketing: false });
  // Lido apenas no cliente (evita hydration mismatch); switches ficam desabilitados
  // ate carregar para nao exibir "off" como se fosse uma preferencia real.
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setState(parseConsentCookie(getConsentCookie()));
    setLoaded(true);
  }, []);

  const toggle = (key: ToggleableCategory, value: boolean) => {
    setSaved(false);
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    // Cookie e a fonte primaria de consentimento (funciona sem rede).
    setConsentCookie(serializeConsent(state));

    try {
      const res = await fetch(API.AUTH.COOKIE_CONSENT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analytics: state.analytics, marketing: state.marketing }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setSaved(true);
      toast.success('Preferências de cookies salvas.');
    } catch {
      // O cookie ja foi gravado; o registro remoto e complementar.
      setSaved(true);
      toast.message('Preferências salvas neste dispositivo.', {
        description: 'Não foi possível sincronizar com o servidor agora, mas sua escolha foi aplicada.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="form-cookie-preferences" className="space-y-6">
      <div className="space-y-4" role="group" aria-label="Categorias de cookies">
        {CATEGORIES.map((category) => {
          const checked = category.locked
            ? true
            : state[category.key as ToggleableCategory];
          return (
            <div
              key={category.key}
              data-testid={`form-cookie-preferences-${category.key}`}
              className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5"
            >
              <div className="space-y-1">
                <Label htmlFor={`consent-${category.key}`} className="text-sm font-medium text-foreground">
                  {category.label}
                </Label>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {category.description}
                </p>
              </div>
              <Switch
                id={`consent-${category.key}`}
                data-testid={`form-cookie-preferences-${category.key}-toggle`}
                checked={checked}
                disabled={category.locked || !loaded}
                onCheckedChange={(value: boolean) =>
                  category.locked
                    ? undefined
                    : toggle(category.key as ToggleableCategory, value)
                }
                aria-label={category.label}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <Button data-testid="form-cookie-preferences-save-button" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar preferências'}
        </Button>
        {saved ? (
          <span data-testid="form-cookie-preferences-saved" className="text-sm text-muted-foreground" role="status" aria-live="polite">
            Preferências aplicadas.
          </span>
        ) : null}
      </div>
    </div>
  );
}
