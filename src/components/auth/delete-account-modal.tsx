'use client';
import { UI_TIMING } from '@/lib/constants';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, ApiError } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
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

export function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const { logout } = useAuth();

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
    onClose();
  };

  const onSubmit = async (data: DeleteAccountInput) => {
    try {
      await apiClient.post(API.AUTH.DELETE_ACCOUNT, { password: data.password });
      toast.success(
        'Conta marcada para exclusão. Você receberá um email de confirmação. A exclusão será efetivada em 30 dias.',
        { duration: 8000 }
      );
      reset();
      onClose();
      setTimeout(() => logout(), UI_TIMING.LOGOUT_REDIRECT);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INVALID_CREDENTIALS') {
          toast.error('Senha incorreta. Tente novamente.');
        } else if (err.code === 'ACTIVE_CREDITS') {
          toast.error(
            'Você ainda possui créditos ativos. Utilize-os antes de excluir sua conta.'
          );
        } else {
          toast.error(err.message || 'Erro ao excluir conta. Tente novamente.');
        }
      } else {
        toast.error('Erro de rede. Verifique sua conexão.');
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="delete-password" className="text-sm font-medium">
              Confirme sua senha
            </Label>
            <Input
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
              <p id="delete-password-error" className="text-xs text-destructive" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirmation" className="text-sm font-medium">
              Digite <strong>EXCLUIR</strong> para confirmar
            </Label>
            <Input
              id="delete-confirmation"
              type="text"
              placeholder="EXCLUIR"
              disabled={isSubmitting}
              aria-invalid={!!errors.confirmation}
              aria-describedby={errors.confirmation ? 'delete-confirmation-error' : undefined}
              {...register('confirmation')}
            />
            {errors.confirmation && (
              <p id="delete-confirmation-error" className="text-xs text-destructive" role="alert">
                {errors.confirmation.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
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
