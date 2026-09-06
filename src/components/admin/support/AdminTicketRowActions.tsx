'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquare, StickyNote, Check, Lock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiClient, ApiError } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import { revalidateAdminSupport } from '@/actions/admin-support';
import type { AdminTicketAction } from '@/lib/support/admin-ticket.schema';

/**
 * Ações inline de um ticket na caixa de entrada admin (T-051 / AD-39).
 *
 * Cobre os três verbos do critério de aceite: responder (mensagem visível ao
 * aluno), registrar nota interna (`isInternal`, separada da thread) e mudar
 * status (resolver/fechar). Cada escrita fala com as rotas admin via
 * `apiClient` (cookies httpOnly), dá feedback explícito (toast) e revalida a
 * caixa (Zero Silêncio). O backend audita cada ação sensível.
 */

interface AdminTicketRowActionsProps {
  ticketId: string;
  status: string;
}

const MAX_BODY = 10_000;

export function AdminTicketRowActions({ ticketId, status }: AdminTicketRowActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);

  const isClosed = status === 'CLOSED';

  const refresh = async () => {
    await revalidateAdminSupport();
    router.refresh();
  };

  const submitMessage = async () => {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      toast.error('Escreva uma mensagem antes de enviar.');
      return;
    }
    if (trimmed.length > MAX_BODY) {
      toast.error('Mensagem muito longa.');
      return;
    }

    setPending(true);
    try {
      await apiClient.post(API.ADMIN.SUPPORT_TICKET(ticketId), {
        body: trimmed,
        isInternal: mode === 'note',
      });
      toast.success(mode === 'note' ? 'Nota interna registrada.' : 'Resposta enviada ao aluno.');
      setBody('');
      setOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao registrar a mensagem.');
    } finally {
      setPending(false);
    }
  };

  const STATUS_TOAST: Record<AdminTicketAction, string> = {
    RESOLVE: 'Ticket resolvido.',
    CLOSE: 'Ticket fechado.',
    REOPEN: 'Ticket reaberto.',
  };

  const changeStatus = async (action: AdminTicketAction) => {
    // Fechar é destrutivo (o aluno deixa de responder): exige confirmação.
    if (action === 'CLOSE' && !window.confirm('Fechar este ticket? O aluno não poderá mais responder até a reabertura.')) {
      return;
    }
    setPending(true);
    try {
      await apiClient.patch(API.ADMIN.SUPPORT_TICKET(ticketId), { action });
      toast.success(STATUS_TOAST[action]);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar o status.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div data-testid={`admin-support-ticket-${ticketId}-actions`} className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button
          data-testid={`admin-support-ticket-${ticketId}-reply-button`}
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={pending || isClosed}
          onClick={() => {
            setMode('reply');
            setOpen((v) => !(v && mode === 'reply'));
          }}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Responder
        </Button>
        <Button
          data-testid={`admin-support-ticket-${ticketId}-note-button`}
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={pending}
          onClick={() => {
            setMode('note');
            setOpen((v) => !(v && mode === 'note'));
          }}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Nota interna
        </Button>
        {status !== 'RESOLVED' && status !== 'CLOSED' && (
          <Button
            data-testid={`admin-support-ticket-${ticketId}-resolve-button`}
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={pending}
            onClick={() => changeStatus('RESOLVE')}
          >
            <Check className="h-3.5 w-3.5" />
            Resolver
          </Button>
        )}
        {(status === 'RESOLVED' || status === 'CLOSED') && (
          <Button
            data-testid={`admin-support-ticket-${ticketId}-reopen-button`}
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={pending}
            onClick={() => changeStatus('REOPEN')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reabrir
          </Button>
        )}
        {!isClosed && (
          <Button
            data-testid={`admin-support-ticket-${ticketId}-close-button`}
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={pending}
            onClick={() => changeStatus('CLOSE')}
          >
            <Lock className="h-3.5 w-3.5" />
            Fechar
          </Button>
        )}
      </div>

      {open && (
        <div data-testid={`admin-support-ticket-${ticketId}-compose`} className="w-full max-w-md rounded-xl border border-border bg-muted/20 p-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {mode === 'note'
              ? 'Nota interna (não visível ao aluno)'
              : 'Resposta ao aluno'}
          </label>
          <Textarea
            data-testid={`admin-support-ticket-${ticketId}-compose-input`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={MAX_BODY}
            placeholder={
              mode === 'note'
                ? 'Anotação operacional sobre este ticket...'
                : 'Escreva sua resposta...'
            }
            disabled={pending}
          />
          <div data-testid={`admin-support-ticket-${ticketId}-compose-actions`} className="mt-2 flex justify-end gap-2">
            <Button
              data-testid={`admin-support-ticket-${ticketId}-compose-cancel-button`}
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setBody('');
              }}
            >
              Cancelar
            </Button>
            <Button data-testid={`admin-support-ticket-${ticketId}-compose-submit-button`} type="button" size="sm" className="gap-1.5" disabled={pending} onClick={submitMessage}>
              {pending && <Loader2 data-testid={`admin-support-ticket-${ticketId}-compose-loading`} className="h-3.5 w-3.5 animate-spin" />}
              {mode === 'note' ? 'Salvar nota' : 'Enviar resposta'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
