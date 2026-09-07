'use client';
import { UI_TIMING } from '@/lib/constants';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, ApiError } from '@/lib/api-client';
import { API, ROUTES } from '@/lib/constants/routes';
import { useAuth } from '@/hooks/useAuth';
import { DeleteAccountSchema, type DeleteAccountInput } from '@/schemas/auth.schema';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Motivo pelo qual a exclusao foi RECUSADA, derivado do que a rota realmente
 * devolve.
 *
 * `POST /api/v1/auth/delete-account` emite `code` (`AUTH_001` senha errada,
 * `AUTH_002` sessao ausente, `VAL_001` payload invalido, `ACTIVE_CREDITS`
 * creditos vivos) com `error: null`; a copy chega ja traduzida pelo catalogo
 * de `src/lib/errors/copy.ts` via `api-client`. A quantidade de lotes viaja em
 * `details.batches`, que e numero e nao tem idioma.
 *
 * `AUTH_001` e `AUTH_002` sao ambos 401 e precisam de tratamento OPOSTO: senha
 * errada tem que ficar na tela, sessao morta tem que levar ao login. Por isso a
 * requisicao passa `skipAuthRedirect: true` — sem ele o `api-client` disparava
 * `auth:expired` em toda senha incorreta e o AuthProvider mandava o usuario
 * para o login, deixando a ramificacao 'senha' deste modulo inalcancavel. O
 * redirect passa a ser decidido aqui, so quando o codigo diz que a sessao caiu.
 *
 * Excluir conta e irreversivel: a recusa fica visivel no formulario, nao so num
 * toast que some.
 */
type MotivoRecusa = 'senha' | 'sessao' | 'creditos' | 'dados' | 'generico' | 'rede';

interface Recusa {
  motivo: MotivoRecusa;
  /** Copy ja traduzida para o locale do leitor. Nunca vazia. */
  detalhe: string;
  /** Lotes de credito ainda ativos, quando o motivo e 'creditos'. */
  lotes?: number;
}

const FALLBACK_RECUSA = 'Nao foi possivel excluir a conta. Tente novamente.';

/** `details.batches` do envelope 409, quando presente e utilizavel. */
function lotesAtivos(details: unknown): number | undefined {
  if (typeof details !== 'object' || details === null) return undefined;
  const batches = (details as { batches?: unknown }).batches;
  return typeof batches === 'number' && Number.isFinite(batches) ? batches : undefined;
}

function classificarRecusa(err: unknown): Recusa {
  if (!(err instanceof ApiError)) {
    return { motivo: 'rede', detalhe: 'Erro de rede. Verifique sua conexao e tente de novo.' };
  }
  const detalhe = err.message || FALLBACK_RECUSA;
  if (err.code === 'AUTH_002') return { motivo: 'sessao', detalhe };
  if (err.status === 409) return { motivo: 'creditos', detalhe, lotes: lotesAtivos(err.details) };
  if (err.status === 400) return { motivo: 'dados', detalhe };
  if (err.status === 401) return { motivo: 'senha', detalhe };
  return { motivo: 'generico', detalhe };
}

export function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const { logout } = useAuth();
  const [recusa, setRecusa] = React.useState<Recusa | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<DeleteAccountInput>({
    resolver: zodResolver(DeleteAccountSchema),
    mode: 'onChange',
  });

  const handleClose = () => {
    if (isSubmitting) return;
    reset();
    setRecusa(null);
    onClose();
  };

  const onSubmit = async (data: DeleteAccountInput) => {
    // Recusa anterior sai da tela antes da nova tentativa: erro velho ao lado
    // de um spinner novo é o que faz o usuário achar que já falhou de novo.
    setRecusa(null);
    try {
      await apiClient.post(
        API.AUTH.DELETE_ACCOUNT,
        { password: data.password },
        { skipAuthRedirect: true },
      );
      toast.success(
        'Conta marcada para exclusão. Você receberá um email de confirmação. A exclusão será efetivada em 30 dias.',
        { duration: 8000 }
      );
      reset();
      onClose();
      setTimeout(() => logout(), UI_TIMING.LOGOUT_REDIRECT);
    } catch (err) {
      const classificada = classificarRecusa(err);
      setRecusa(classificada);
      toast.error(classificada.detalhe);
      if (classificada.motivo === 'sessao') {
        // Sessao caiu de verdade. Quem decide o destino nesse caso e o
        // AuthProvider, dono unico do listener `auth:expired`; o modal so
        // avisa, para o usuario nao ser teleportado sem explicacao.
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent data-testid="modal-delete-account" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <DialogTitle>Excluir minha conta</DialogTitle>
          </div>
          <DialogDescription>
            Esta ação é irreversível. Após a confirmação, sua conta entrará em um
            período de carência de <strong>30 dias</strong>. Durante esse período,
            você pode cancelar a exclusão fazendo login novamente. Após 30 dias,
            todos os seus dados serão permanentemente removidos.
          </DialogDescription>
        </DialogHeader>

        <form data-testid="form-delete-account" onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="delete-password" className="text-sm font-medium">
              Confirme sua senha
            </Label>
            <Input
              data-testid="form-delete-account-password-input"
              id="delete-password"
              type="password"
              placeholder="Digite sua senha"
              autoComplete="current-password"
              disabled={isSubmitting}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'delete-password-error' : undefined}
              {...register('password')}
            />
            {errors.password && (
              <p data-testid="form-delete-account-password-error" id="delete-password-error" className="text-xs text-destructive" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirmation" className="text-sm font-medium">
              Digite <strong>EXCLUIR</strong> para confirmar
            </Label>
            <Input
              data-testid="form-delete-account-confirmation-input"
              id="delete-confirmation"
              type="text"
              placeholder="EXCLUIR"
              disabled={isSubmitting}
              aria-invalid={!!errors.confirmation}
              aria-describedby={errors.confirmation ? 'delete-confirmation-error' : undefined}
              {...register('confirmation')}
            />
            {errors.confirmation && (
              <p data-testid="form-delete-account-confirmation-error" id="delete-confirmation-error" className="text-xs text-destructive" role="alert">
                {errors.confirmation.message}
              </p>
            )}
          </div>

          {recusa && (
            <div
              data-testid="form-delete-account-refusal"
              data-motivo={recusa.motivo}
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <p>{recusa.detalhe}</p>
              {recusa.motivo === 'creditos' && (
                <p className="mt-1.5 text-xs">
                  {recusa.lotes !== undefined && (
                    <span data-testid="form-delete-account-refusal-batches">
                      Lotes ativos: {recusa.lotes}.{' '}
                    </span>
                  )}
                  Use os créditos restantes agendando aulas — depois disso a exclusão fica liberada.{' '}
                  <Link
                    data-testid="form-delete-account-refusal-schedule-link"
                    href={ROUTES.SCHEDULE}
                    className="underline underline-offset-2"
                  >
                    Agendar aula
                  </Link>
                </p>
              )}
              {recusa.motivo === 'senha' && (
                <p className="mt-1.5 text-xs">Confirme a senha e tente novamente.</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button data-testid="form-delete-account-cancel-button" type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              data-testid="form-delete-account-submit-button"
              type="submit"
              variant="destructive"
              disabled={isSubmitting || !isValid}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir conta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
