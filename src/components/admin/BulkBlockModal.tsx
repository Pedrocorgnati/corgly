'use client';
import { API } from '@/lib/constants/routes';

import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

interface BulkBlockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function BulkBlockModal({
  open,
  onOpenChange,
  onComplete,
}: BulkBlockModalProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState<{
    sessionsToCancel: number;
    slotsToBlock: number;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  /**
   * Token monotonic de correlacao requisicao<->resposta da previa.
   *
   * Sem ele, trocar `startDate`/`endDate` com uma previa em voo deixava o
   * retorno ANTIGO repovoar `preview` depois que o `onChange` ja havia limpado
   * o estado: o modal voltava a exibir "Confirmar bloqueio" com a contagem de
   * um periodo que nao e mais o selecionado, enquanto `handleSubmit` submete as
   * datas correntes. Contagem de um periodo, operacao destrutiva em outro.
   */
  const previewRequestId = useRef(0);

  if (!open) return null;

  const canSubmit = startDate && endDate && reason.trim().length > 0 && endDate >= startDate;

  /**
   * Invalida a previa corrente e QUALQUER requisicao em voo.
   *
   * Chamado por toda mudanca de periodo e pelo fechamento do modal. Bumpar o
   * token aqui e o que impede a resposta obsoleta de escrever no estado; sem
   * isso, limpar `preview` no `onChange` era desfeito pelo retorno atrasado.
   */
  const invalidatePreview = () => {
    previewRequestId.current += 1;
    setPreview(null);
    setPreviewError(null);
    setIsPreviewing(false);
  };

  const handlePreview = async () => {
    if (!canSubmit) return;
    const requestId = ++previewRequestId.current;
    setPreviewError(null);
    setIsPreviewing(true);
    try {
      const json = await apiClient.get<{ data: { sessionsToCancel: number; slotsToBlock: number } }>(
        API.SESSIONS_BULK_CANCEL,
        { params: { startDate, endDate } },
      );
      // Resposta obsoleta: o operador ja trocou o periodo (ou fechou o modal).
      // Descartar em silencio e correto — a UI ja reflete "sem previa" por acao
      // do proprio operador; escrever aqui seria a mentira de estado.
      if (requestId !== previewRequestId.current) return;
      // Sem `?? 0`: resposta 200 sem `data` e defeito de contrato, nao previa de
      // zero. A semente de zeros que existia aqui fazia o operador confirmar uma
      // operacao destrutiva depois de ler que ela nao afetava nada.
      setPreview({
        sessionsToCancel: json.data.sessionsToCancel,
        slotsToBlock: json.data.slotsToBlock,
      });
    } catch (err) {
      // Erro de requisicao obsoleta tambem nao fala pelo periodo corrente.
      if (requestId !== previewRequestId.current) return;
      setPreview(null);
      setPreviewError(
        err instanceof Error ? err.message : 'Não foi possível calcular a prévia. Tente novamente.',
      );
    } finally {
      // `invalidatePreview` ja zerou o spinner quando invalidou esta requisicao.
      if (requestId === previewRequestId.current) setIsPreviewing(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      // O servico devolve `{ cancelled, refunded, blocked, errors }` (BulkCancelResult).
      // As chaves `cancelledCount`/`refundedCount` lidas antes nunca existiram: o
      // toast dizia "0 e 0" mesmo apos cancelar dezenas de aulas.
      const json = await apiClient.post<{
        data: { cancelled: number; refunded: number; blocked: number };
      }>(API.SESSIONS_BULK_CANCEL, { startDate, endDate, reason });
      const { cancelled, refunded, blocked } = json.data;
      toast.success(
        `${cancelled} sessões canceladas, ${refunded} créditos reembolsados, ${blocked} horários bloqueados.`,
      );
      onComplete();
      handleClose();
    } catch {
      toast.error('Erro ao executar operação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStartDate('');
    setEndDate('');
    setReason('');
    invalidatePreview();
    onOpenChange(false);
  };

  return (
    <div
      data-testid="modal-bulk-block"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Bloqueio e cancelamento em massa"
    >
      <div className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-md mx-4 p-6">
        <h3 data-testid="modal-bulk-block-header" className="text-lg font-semibold text-foreground mb-4">
          Bloqueio em massa
        </h3>

        <div data-testid="modal-bulk-block-form" className="space-y-4 mb-6">
          <div>
            <label htmlFor="bulk-start" className="text-sm font-medium text-foreground block mb-1">
              Data início
            </label>
            <input
              data-testid="modal-bulk-block-start-input"
              id="bulk-start"
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); invalidatePreview(); }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="bulk-end" className="text-sm font-medium text-foreground block mb-1">
              Data fim
            </label>
            <input
              data-testid="modal-bulk-block-end-input"
              id="bulk-end"
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); invalidatePreview(); }}
              min={startDate}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="bulk-reason" className="text-sm font-medium text-foreground block mb-1">
              Motivo <span className="text-destructive">*</span>
            </label>
            <Textarea
              data-testid="modal-bulk-block-reason-input"
              id="bulk-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Informe o motivo do bloqueio/cancelamento..."
              className="min-h-[80px] resize-none"
            />
          </div>

          {preview && (
            <div data-testid="modal-bulk-block-preview" className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-sm font-medium text-amber-700">Preview da operação:</p>
              <ul className="text-sm text-muted-foreground mt-1 list-disc list-inside">
                <li>{preview.sessionsToCancel} sessões serão canceladas</li>
                <li>{preview.slotsToBlock} slots serão bloqueados</li>
              </ul>
            </div>
          )}

          {previewError && (
            <p
              data-testid="modal-bulk-block-preview-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {previewError}
            </p>
          )}
        </div>

        <div data-testid="modal-bulk-block-actions" className="flex gap-3">
          <Button data-testid="modal-bulk-block-cancel-button" variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            Cancelar
          </Button>
          {!preview ? (
            <Button
              data-testid="modal-bulk-block-preview-button"
              onClick={handlePreview}
              disabled={!canSubmit || isPreviewing}
              className="flex-1"
            >
              {isPreviewing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Calculando...
                </>
              ) : (
                'Visualizar impacto'
              )}
            </Button>
          ) : (
            <Button
              data-testid="modal-bulk-block-confirm-button"
              variant="destructive"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Executando...
                </>
              ) : (
                'Confirmar bloqueio'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
