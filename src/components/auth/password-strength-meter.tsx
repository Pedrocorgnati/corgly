/**
 * @module components/auth/password-strength-meter
 * Indicador visual de força da senha — reutilizável em qualquer formulário.
 */

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (password.length >= 12) score++;
  if (score <= 1) return { score, label: 'Senha fraca', color: 'bg-destructive' };
  if (score === 2) return { score, label: 'Senha razoável', color: 'bg-warning' };
  if (score <= 4) return { score, label: 'Senha forte', color: 'bg-success' };
  return { score, label: 'Senha muito forte', color: 'bg-success' };
}

interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const strength = getPasswordStrength(password);

  if (!password) return null;

  return (
    <div className="space-y-1">
      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
          style={{ width: `${Math.min((strength.score / 5) * 100, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{strength.label}</p>
    </div>
  );
}
