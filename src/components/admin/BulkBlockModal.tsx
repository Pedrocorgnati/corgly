'use client';
import { API } from '@/lib/constants/routes';

import { useState } from 'react';
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

  if (!open) return null;

  const canSubmit = startDate && endDate && reason.trim().length > 0 && endDate >= startDate;

  const handlePreview = async () => {
    if (!canSubmit) return;
    // For now, we show a generic preview — a real implementation would call a preview endpoint
    setPreview({
      sessionsToCancel: 0,
      slotsToBlock: 0,
    });
    // Try fetching preview from API
    try {
      const json = await apiClient.get<{ data: { sessionsToCancel: number; slotsToBlock: number } }>(
        API.SESSIONS_BULK_CANCEL,
        { params: { startDate, endDate, preview: true } },
      );
      setPreview({
        sessionsToCancel: json.data?.sessionsToCancel ?? 0,
        slotsToBlock: json.data?.slotsToBlock ?? 0,
      });
    } catch {
      // Preview is optional; proceed with submit
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const json = await apiClient.post<{ data: { cancelledCount: number; refundedCount: number } }>(
        API.SESSIONS_BULK_CANCEL,
        { startDate, endDate, reason },
      );
      const cancelled = json.data?.cancelledCount ?? 0;
      const refunded = json.data?.refundedCount ?? 0;
      toast.success(`${cancelled} sessões canceladas, ${refunded} créditos reembolsados.`);
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
    setPreview(null);
    onOpenChange(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Bloqueio e cancelamento em massa"
    >
      <div className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Bloqueio em massa
        </h3>

        <div className="space-y-4 mb-6">
          <div>
            <label htmlFor="bulk-start" className="text-sm font-medium text-foreground block mb-1">
              Data início
            </label>
            <input
              id="bulk-start"
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPreview(null); }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="bulk-end" className="text-sm font-medium text-foreground block mb-1">
              Data fim
            </label>
            <input
              id="bulk-end"
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPreview(null); }}
              min={startDate}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="bulk-reason" className="text-sm font-medium text-foreground block mb-1">
              Motivo <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="bulk-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Informe o motivo do bloqueio/cancelamento..."
              className="min-h-[80px] resize-none"
            />
          </div>

          {preview && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-sm font-medium text-amber-700">Preview da operação:</p>
              <ul className="text-sm text-muted-foreground mt-1 list-disc list-inside">
                <li>{preview.sessionsToCancel} sessões serão canceladas</li>
                <li>{preview.slotsToBlock} slots serão bloqueados</li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            Cancelar
          </Button>
          {!preview ? (
            <Button onClick={handlePreview} disabled={!canSubmit} className="flex-1">
              Visualizar impacto
            </Button>
          ) : (
            <Button
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
