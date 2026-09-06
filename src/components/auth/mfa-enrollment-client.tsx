'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import QRCode from 'react-qr-code';
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
  Smartphone,
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
import { API, ROUTES } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import { DEFAULT_ADMIN_REDIRECT, withRedirectTo } from '@/lib/auth/safe-redirect';
import { describeMfaApiError } from './mfa-messages';

export interface MfaStatusView {
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

interface VerifyResponse {
  data: {
    enabled: boolean;
    status: 'NONE' | 'PENDING' | 'ACTIVE';
    justEnrolled: boolean;
    usedRecoveryCode: boolean;
    recoveryCodesRemaining: number;
    mfaVerifiedAt: string;
  };
}

interface Completed {
  recoveryCodes: string[];
  justEnrolled: boolean;
}

export type MfaEnrollmentMode = 'settings' | 'setup';

interface Props {
  /**
   * `settings`: painel /admin/account/security (gestao continua).
   * `setup`: tela publica /auth/mfa/setup (primeiro cadastro obrigatorio);
   * ao concluir, navega para `redirectTo`.
   */
  mode: MfaEnrollmentMode;
  initialStatus: MfaStatusView;
  loadError: boolean;
  /** Destino final no modo `setup` (ja sanitizado pela pagina servidor). */
  redirectTo?: string;
}

const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente para continuar.';

/**
 * Fluxo de cadastro/reconfiguracao de MFA TOTP do admin, compartilhado entre o
 * painel de seguranca e a tela publica de setup obrigatorio.
 *
 * Estados: loadError, idle (NONE/PENDING/ACTIVE), enrollment (QR + confirmacao),
 * completed (codigos de recuperacao + saida). Sad paths: 401 (sessao expirada),
 * 403 mfa_required (reconfiguracao sem MFA recente), 400 (codigo invalido),
 * 409, 429 (rate limit), timeout/rede.
 */
export function MfaEnrollmentClient({ mode, initialStatus, loadError, redirectTo }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<MfaStatusView>(initialStatus);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [isIniting, setIsIniting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  const isSetup = mode === 'setup';

  if (loadError) {
    return (
      <ErrorState
        data-testid={isSetup ? 'auth-mfa-load-error' : 'admin-account-security-error'}
        title="Erro ao carregar o status do MFA"
        message="Não foi possível verificar o status do MFA. Tente novamente."
        onRetry={() => router.refresh()}
      />
    );
  }

  function handleSessionExpired() {
    toast.error(SESSION_EXPIRED_MESSAGE);
    const here = window.location.pathname + window.location.search;
    router.replace(withRedirectTo(ROUTES.LOGIN, here));
  }

  async function handleInit() {
    setIsIniting(true);
    setFormError(null);
    try {
      const res = await apiClient.post<{ data: Enrollment }>(
        API.AUTH.MFA_TOTP_INIT,
        {},
        { skipAuthRedirect: true },
      );
      setEnrollment(res.data);
      setCompleted(null);
      setCode('');
      toast.success('Segredo gerado. Escaneie o QR code e confirme com um código.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired();
        return;
      }
      if (err instanceof ApiError && err.status === 403 && err.code === 'mfa_required') {
        toast.error('Confirme o MFA para reconfigurar.');
        // setup: volta ao destino original apos o challenge; settings: volta ao painel.
        router.replace(
          withRedirectTo(
            ROUTES.MFA_CHALLENGE,
            isSetup ? (redirectTo ?? DEFAULT_ADMIN_REDIRECT) : ROUTES.ADMIN_ACCOUNT_SECURITY,
          ),
        );
        return;
      }
      const msg = describeMfaApiError(err, 'Erro ao iniciar o cadastro de MFA.');
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
      const res = await apiClient.post<VerifyResponse>(
        API.AUTH.MFA_VERIFY,
        { code: code.trim() },
        { skipAuthRedirect: true },
      );
      const justEnrolled = res.data.justEnrolled;
      setStatus({
        enabled: res.data.enabled,
        status: res.data.status,
        confirmedAt: justEnrolled ? res.data.mfaVerifiedAt : status.confirmedAt,
        recoveryCodesRemaining: res.data.recoveryCodesRemaining,
      });
      setCompleted({ recoveryCodes: enrollment?.recoveryCodes ?? [], justEnrolled });
      setEnrollment(null);
      setCode('');
      toast.success(justEnrolled ? 'MFA ativado com sucesso.' : 'Identidade verificada com sucesso.');
      // No modo setup NAO chamamos router.refresh(): a pagina servidor redirecionaria
      // para /admin/account/security antes de o admin ler os codigos de recuperacao.
      if (!isSetup) router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired();
        return;
      }
      const msg = describeMfaApiError(err, 'Código inválido. Tente novamente.');
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsVerifying(false);
    }
  }

  function handleFinish() {
    if (isSetup) {
      setIsLeaving(true);
      router.replace(redirectTo ?? DEFAULT_ADMIN_REDIRECT);
      return;
    }
    setCompleted(null);
  }

  async function copySecret() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Copie manualmente.');
    }
  }

  async function copyRecoveryCodes(codes: string[]) {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopiedCodes(true);
      toast.success('Códigos de recuperação copiados.');
      setTimeout(() => setCopiedCodes(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Copie manualmente.');
    }
  }

  const isActive = status.status === 'ACTIVE';
  const isPending = status.status === 'PENDING';

  const initLabel = isActive
    ? 'Reconfigurar / gerar novos códigos'
    : isPending
      ? 'Gerar novo segredo e continuar'
      : 'Configurar MFA';

  return (
    <div
      data-testid={isSetup ? 'auth-mfa-setup-flow' : 'admin-account-security-mfa'}
      className={isSetup ? 'space-y-6' : 'space-y-6 max-w-2xl'}
    >
      {/* Cartao de status */}
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
                <CardTitle>Autenticação em duas etapas (MFA)</CardTitle>
                <CardDescription>
                  Protege o acesso administrativo com um código TOTP gerado no seu
                  app autenticador.
                </CardDescription>
              </div>
            </div>
            <Badge variant={isActive ? 'default' : 'outline'}>
              {isActive ? 'Ativo' : isPending ? 'Pendente' : 'Inativo'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isActive ? (
            <p className="text-sm text-muted-foreground">
              MFA ativo. Códigos de recuperação restantes:{' '}
              <span className="font-medium text-foreground">
                {status.recoveryCodesRemaining}
              </span>
              .
            </p>
          ) : isSetup ? (
            <p className="text-sm text-muted-foreground">
              Sua conta administrativa precisa do MFA ativo para acessar o painel.
              Configure agora com o app autenticador de sua preferência.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              O MFA ainda não está ativo nesta conta. Configure agora para reforçar
              a segurança do acesso administrativo.
            </p>
          )}
        </CardContent>
      </Card>

      {completed ? (
        /* Passo final: codigos de recuperacao + saida explicita */
        <Card data-testid="mfa-enrollment-success-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-success" aria-hidden />
              <div>
                <CardTitle className="text-base">
                  {completed.justEnrolled ? 'MFA ativado' : 'Identidade verificada'}
                </CardTitle>
                <CardDescription>
                  {completed.recoveryCodes.length > 0
                    ? 'Guarde os códigos de recuperação abaixo em um lugar seguro. Eles não serão exibidos novamente.'
                    : 'Sua verificação foi concluída.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {completed.recoveryCodes.length > 0 && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-warning" aria-hidden />
                    <p className="text-sm font-medium text-foreground">
                      Códigos de recuperação
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="mfa-enrollment-copy-codes-button"
                    onClick={() => copyRecoveryCodes(completed.recoveryCodes)}
                  >
                    {copiedCodes ? (
                      <Check className="h-4 w-4 mr-1" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4 mr-1" aria-hidden />
                    )}
                    Copiar todos
                  </Button>
                </div>
                <ul className="grid grid-cols-2 gap-1.5">
                  {completed.recoveryCodes.map((rc) => (
                    <li
                      key={rc}
                      className="rounded bg-background border border-border px-2 py-1 text-sm font-mono text-center"
                    >
                      {rc}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Cada código serve uma única vez. Use-os se perder acesso ao app
                  autenticador.
                </p>
              </div>
            )}
            <Button
              data-testid="mfa-enrollment-finish-button"
              type="button"
              className={isSetup ? 'w-full' : undefined}
              onClick={handleFinish}
              disabled={isLeaving}
            >
              {isLeaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Abrindo o painel...
                </>
              ) : isSetup ? (
                'Concluir e acessar o painel'
              ) : (
                'Concluir'
              )}
            </Button>
          </CardContent>
        </Card>
      ) : enrollment ? (
        /* Passo de confirmacao: QR code + segredo + codigo */
        <Card data-testid="admin-account-security-enrollment-card">
          <CardHeader>
            <CardTitle className="text-base">Confirme o cadastro</CardTitle>
            <CardDescription>
              Escaneie o QR code com o app autenticador (ou digite o segredo) e
              informe o código de 6 dígitos para ativar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col items-center gap-3">
              <div
                role="img"
                aria-label="QR code para configurar o app autenticador"
                data-testid="mfa-enrollment-qr"
                className="rounded-lg bg-white p-3"
              >
                <QRCode value={enrollment.otpauthUri} size={192} bgColor="#FFFFFF" fgColor="#000000" />
              </div>
              <a
                data-testid="mfa-enrollment-open-app-link"
                href={enrollment.otpauthUri}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Smartphone className="h-4 w-4" aria-hidden />
                Abrir no app autenticador
              </a>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Segredo (entrada manual)</Label>
              <div className="flex items-center gap-2">
                <code
                  data-testid="mfa-enrollment-secret"
                  className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono break-all"
                >
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
            </div>

            <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound className="h-4 w-4 text-warning" aria-hidden />
                <p className="text-sm font-medium text-foreground">
                  Códigos de recuperação (guarde agora)
                </p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Cada código serve uma única vez e não será exibido novamente. Use-os
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

            <form data-testid="form-mfa-verify" onSubmit={handleVerify} className="space-y-3" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="mfa-code" className="text-sm font-medium">
                  Código de verificação
                </Label>
                <Input
                  data-testid="form-mfa-verify-code-input"
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="000000"
                  maxLength={32}
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
                <Button
                  data-testid="form-mfa-verify-submit-button"
                  type="submit"
                  disabled={isVerifying || code.trim().length < 6}
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Confirmando...
                    </>
                  ) : (
                    'Confirmar e ativar'
                  )}
                </Button>
                {isSetup ? (
                  <Button
                    data-testid="form-mfa-verify-cancel-button"
                    type="button"
                    variant="ghost"
                    disabled={isVerifying || isIniting}
                    onClick={handleInit}
                  >
                    Gerar outro segredo
                  </Button>
                ) : (
                  <Button
                    data-testid="form-mfa-verify-cancel-button"
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
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        /* Passo inicial: iniciar/reiniciar cadastro */
        <Card>
          <CardContent className="pt-6 space-y-4">
            {isPending && (
              <div
                data-testid="mfa-enrollment-pending-notice"
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" aria-hidden />
                <span>
                  Um cadastro anterior não foi concluído. Ao continuar, um novo segredo
                  e novos códigos de recuperação serão gerados e os anteriores deixarão
                  de valer.
                </span>
              </div>
            )}
            {!isActive && !isPending && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" aria-hidden />
                <span>
                  {isSetup
                    ? 'Obrigatório para todas as contas administrativas.'
                    : 'Recomendado para todas as contas administrativas.'}
                </span>
              </div>
            )}
            {formError && (
              <p className="text-xs text-destructive" role="alert">
                {formError}
              </p>
            )}
            <Button
              data-testid="admin-account-security-init-mfa-button"
              className={isSetup ? 'w-full' : undefined}
              onClick={handleInit}
              disabled={isIniting}
            >
              {isIniting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Gerando segredo...
                </>
              ) : (
                initLabel
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
