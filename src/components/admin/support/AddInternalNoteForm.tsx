'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { apiClient, ApiError } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import { revalidateStudentNotes } from '@/actions/admin-support';

/**
 * Formulário de nota interna na página de notas do aluno (T-051 / AD-15).
 *
 * Uma nota interna vive presa a um ticket (modelo `SupportMessage.isInternal`),
 * então o admin escolhe o ticket-alvo (entre os abertos do aluno) e escreve a
 * anotação. A nota é "separada da thread": nunca aparece para o aluno. O POST
 * vai para a rota admin do ticket com `isInternal:true` (auditada no backend).
 * Sem ticket aberto, a UI explica o porquê (Zero Estados Indefinidos).
 */

interface OpenTicketOption {
  id: string;
  subject: string;
  status: string;
}

interface AddInternalNoteFormProps {
  studentId: string;
  openTickets: OpenTicketOption[];
}

const MAX_BODY = 10_000;

const selectClassName =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60';

export function AddInternalNoteForm({ studentId, openTickets }: AddInternalNoteFormProps) {
  const router = useRouter();
  const [ticketId, setTicketId] = useState(openTickets[0]?.id ?? '');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);

  const noTickets = openTickets.length === 0;

  const submit = async () => {
    if (noTickets) return;
    if (!ticketId) {
      toast.error('Selecione um ticket para anexar a nota.');
      return;
    }
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      toast.error('Escreva a nota antes de salvar.');
      return;
    }
    if (trimmed.length > MAX_BODY) {
      toast.error('Nota muito longa.');
      return;
    }

    setPending(true);
    try {
      await apiClient.post(API.ADMIN.SUPPORT_TICKET(ticketId), {
        body: trimmed,
        isInternal: true,
      });
      toast.success('Nota interna registrada.');
      setBody('');
      await revalidateStudentNotes(studentId);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao registrar a nota.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      data-testid="form-internal-note"
      className="rounded-2xl border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div data-testid="form-internal-note-header" className="mb-3 flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-semibold text-foreground">Nova nota interna</h2>
      </div>

      {noTickets ? (
        <p data-testid="form-internal-note-empty" className="text-sm text-muted-foreground">
          O aluno não possui tickets abertos. Notas internas são anexadas a um
          ticket; abra ou reabra um chamado na caixa de suporte para registrar uma
          nota.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <Label htmlFor="note-ticket" className="text-xs text-muted-foreground">
              Ticket
            </Label>
            <select
              data-testid="form-internal-note-ticket-select"
              id="note-ticket"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              className={`mt-1 ${selectClassName}`}
              disabled={pending}
            >
              {openTickets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.subject} ({t.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="note-body" className="text-xs text-muted-foreground">
              Nota (visível só para a equipe)
            </Label>
            <Textarea
              data-testid="form-internal-note-body-input"
              id="note-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={MAX_BODY}
              placeholder="Contexto operacional, histórico, alertas..."
              className="mt-1"
              disabled={pending}
            />
          </div>

          <div data-testid="form-internal-note-actions" className="flex justify-end">
            <Button data-testid="form-internal-note-submit-button" type="submit" className="gap-1.5" disabled={pending}>
              {pending && <Loader2 data-testid="form-internal-note-loading" className="h-4 w-4 animate-spin" />}
              Salvar nota
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
