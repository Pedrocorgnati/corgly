'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { API } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';

interface MfaStatusView {
  enabled: boolean;
  status: 'NONE' | 'PENDING' | 'ACTIVE';
  confirmedAt: string | null;
  recoveryCodesRemaining: number;
}

interface Enrollment {
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
}

interface Props {
  initialStatus: MfaStatusView;
  loadError: boolean;
}

export function SecurityMfaClient({ initialStatus, loadError }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<MfaStatusView>(initialStatus);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [isIniting, setIsIniting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── Estado de erro de carga (Zero Estados Indefinidos) ───────────────────
  if (loadError) {
    return (
      <ErrorState
        title="Erro ao carregar configuracoes de seguranca"
        message="Nao foi possivel obter o status do MFA. Tente novamente."
        onRetry={() => router.refresh()}
      />
    );
  }

  async function handleInit() {
    setIsIniting(true);
    setFormError(null);
    try {
      const res = await apiClient.post<{ data: Enrollment }>(
        API.AUTH.MFA_TOTP_INIT,
        {},
      );
      setEnrollment(res.data);
      setCode('');
      toast.success('Cadastro iniciado. Escaneie o segredo e confirme com um codigo.');
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Erro ao iniciar o cadastro de MFA.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsIniting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setIsVerifying(true);
    setFormError(null);
    try {
      const res = await apiClient.post<{ data: MfaStatusView & { justEnrolled: boolean } }>(
        API.AUTH.MFA_VERIFY,
        { code: code.trim() },
      );
      setStatus({
        enabled: res.data.enabled,
        status: res.data.status,
        confirmedAt: status.confirmedAt,
        recoveryCodesRemaining: res.data.recoveryCodesRemaining,
      });
      setEnrollment(null);
      setCode('');
      toast.success(
        res.data.justEnrolled
          ? 'MFA ativado com sucesso.'
          : 'Identidade verificada com sucesso.',
      );
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Codigo invalido. Tente novamente.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsVerifying(false);
    }
  }

  async function copySecret() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Nao foi possivel copiar. Copie manualmente.');
    }
  }

  const isActive = status.status === 'ACTIVE';

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ─── Cartao de status (success/empty renderavel) ──────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {isActive ? (
                <ShieldCheck className="h-6 w-6 text-success" aria-hidden />
              ) : (
                <ShieldAlert className="h-6 w-6 text-muted-foreground" aria-hidden />
              )}
              <div>
                <CardTitle>Autenticacao em duas etapas (MFA)</CardTitle>
                <CardDescription>
                  Protege o acesso administrativo com um codigo TOTP gerado no seu
                  app autenticador.
                </CardDescription>
              </div>
            </div>
            <Badge variant={isActive ? 'default' : 'outline'}>
              {isActive ? 'Ativo' : status.status === 'PENDING' ? 'Pendente' : 'Inativo'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isActive ? (
            <p className="text-sm text-muted-foreground">
              MFA ativo. Codigos de recuperacao restantes:{' '}
              <span className="font-medium text-foreground">
                {status.recoveryCodesRemaining}
              </span>
              .
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              O MFA ainda nao esta ativo nesta conta. Configure agora para reforcar
              a seguranca do acesso administrativo.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ─── Fluxo de cadastro / reconfiguracao ───────────────────────────── */}
      {enrollment ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confirme o cadastro</CardTitle>
            <CardDescription>
              Adicione o segredo abaixo ao seu app autenticador e informe o codigo
              de 6 digitos para ativar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Segredo (entrada manual)</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono break-all">
                  {enrollment.secret}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copySecret}
                  aria-label="Copiar segredo"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground break-all">
                URI: {enrollment.otpauthUri}
              </p>
            </div>

            <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound className="h-4 w-4 text-warning" aria-hidden />
                <p className="text-sm font-medium text-foreground">
                  Codigos de recuperacao (guarde agora)
                </p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Cada codigo serve uma unica vez e nao sera exibido novamente. Use-os
                se perder acesso ao app autenticador.
              </p>
              <ul className="grid grid-cols-2 gap-1.5">
                {enrollment.recoveryCodes.map((rc) => (
                  <li
                    key={rc}
                    className="rounded bg-background border border-border px-2 py-1 text-sm font-mono text-center"
                  >
                    {rc}
                  </li>
                ))}
              </ul>
            </div>

            <form onSubmit={handleVerify} className="space-y-3" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="mfa-code" className="text-sm font-medium">
                  Codigo de verificacao
                </Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  disabled={isVerifying}
                  onChange={(e) => setCode(e.target.value)}
                  aria-invalid={!!formError}
                  aria-describedby={formError ? 'mfa-error' : undefined}
                />
                {formError && (
                  <p id="mfa-error" className="text-xs text-destructive" role="alert">
                    {formError}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isVerifying || code.trim().length < 6}>
                  {isVerifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Confirmando...
                    </>
                  ) : (
                    'Confirmar e ativar'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isVerifying}
                  onClick={() => {
                    setEnrollment(null);
                    setFormError(null);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {!isActive && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" aria-hidden />
                <span>
                  Recomendado para todas as contas administrativas.
                </span>
              </div>
            )}
            {formError && (
              <p className="text-xs text-destructive" role="alert">
                {formError}
              </p>
            )}
            <Button onClick={handleInit} disabled={isIniting}>
              {isIniting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Gerando segredo...
                </>
              ) : isActive ? (
                'Reconfigurar / gerar novos codigos'
              ) : (
                'Configurar MFA'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Continuidade: a UI/API canonica de MFA (gestao avancada, step-up em
          endpoints) sera entregue em T-067. */}
    </div>
  );
}
