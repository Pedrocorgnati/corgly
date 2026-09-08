'use client';

/**
 * @module components/auth/password-strength-meter
 * Indicador visual de forca da senha — reutilizavel em qualquer formulario.
 *
 * Ate 2026-09-07 `getPasswordStrength` devolvia o ROTULO ja escrito em portugues,
 * o que colocava copy de interface dentro de uma funcao pura e a deixava fora do
 * alcance do next-intl. Agora ela devolve a CHAVE e quem renderiza traduz.
 */
import { useTranslations } from 'next-intl';

type StrengthKey = 'weak' | 'fair' | 'strong' | 'veryStrong';

interface PasswordStrength {
  score: number;
  /** `null` quando nao ha senha digitada: nao existe rotulo a exibir. */
  labelKey: StrengthKey | null;
  color: string;
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, labelKey: null, color: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (password.length >= 12) score++;
  if (score <= 1) return { score, labelKey: 'weak', color: 'bg-destructive' };
  if (score === 2) return { score, labelKey: 'fair', color: 'bg-warning' };
  if (score <= 4) return { score, labelKey: 'strong', color: 'bg-success' };
  return { score, labelKey: 'veryStrong', color: 'bg-success' };
}

interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const t = useTranslations('auth.password');
  const strength = getPasswordStrength(password);

  if (!password || !strength.labelKey) return null;

  return (
    <div className="space-y-1">
      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
          style={{ width: `${Math.min((strength.score / 5) * 100, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t(strength.labelKey)}</p>
    </div>
  );
}
