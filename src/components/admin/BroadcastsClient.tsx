'use client';

import { useCallback, useEffect, useState } from 'react';
import { Send, RefreshCw, Eye, X, AlertTriangle } from 'lucide-react';

// Opcoes de segmento (espelho da allowlist do servidor; o POST revalida via
// z.enum(BROADCAST_SEGMENTS), entao isto e apenas UI).
const SEGMENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Todos os usuarios (opt-in)' },
  { value: 'STUDENTS', label: 'Alunos' },
  { value: 'ADMINS', label: 'Administradores' },
  { value: 'LOCALE_PT_BR', label: 'Idioma: Portugues (BR)' },
  { value: 'LOCALE_EN_US', label: 'Idioma: Ingles (US)' },
  { value: 'LOCALE_ES_ES', label: 'Idioma: Espanhol (ES)' },
  { value: 'LOCALE_IT_IT', label: 'Idioma: Italiano (IT)' },
];

interface BroadcastRow {
  broadcastId: string;
  adminId: string;
  createdAt: string;
  segment: string | null;
  subject: string | null;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
}

interface DeliveryRow {
  id: string;
  toEmail: string;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  locale: string;
  createdAt: string;
}

type Banner = { kind: 'success' | 'error'; text: string } | null;

const STATUS_CLASS: Record<string, string> = {
  SENT: 'bg-primary/15 text-primary',
  FAILED: 'bg-destructive/10 text-destructive',
  SKIPPED: 'bg-muted text-muted-foreground',
  QUEUED: 'bg-muted text-muted-foreground',
};

function segmentLabel(value: string | null): string {
  if (!value) return '—';
  return SEGMENT_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function BroadcastsClient() {
  const [segment, setSegment] = useState<string>('ALL');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const [items, setItems] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [deliveries, setDeliveries] = useState<{ broadcastId: string; rows: DeliveryRow[] } | null>(null);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetch('/api/v1/admin/broadcasts', { credentials: 'include', signal });
      const json = await res.json();
      if (!res.ok) {
        setListError(json.error ?? 'Falha ao carregar broadcasts.');
        setItems([]);
      } else {
        setItems(json.data?.items ?? []);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setListError('Falha de rede ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function requestSend() {
    setBanner(null);
    if (!subject.trim()) {
      setBanner({ kind: 'error', text: 'Informe o assunto.' });
      return;
    }
    if (!html.trim()) {
      setBanner({ kind: 'error', text: 'Informe o conteudo do email.' });
      return;
    }
    setShowConfirm(true);
  }

  async function confirmSend() {
    setSending(true);
    setBanner(null);
    try {
      const res = await fetch('/api/v1/admin/broadcasts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, subject, html, confirm: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setBanner({ kind: 'error', text: json.error ?? 'Falha ao enviar broadcast.' });
      } else {
        const d = json.data ?? {};
        const capped = d.capped ? ' (limite de destinatarios atingido)' : '';
        setBanner({
          kind: 'success',
          text: `Broadcast enviado: ${d.sent ?? 0} enviados, ${d.failed ?? 0} falhas, ${d.skipped ?? 0} pulados (opt-out)${capped}.`,
        });
        setSubject('');
        setHtml('');
        await load();
      }
    } catch {
      setBanner({ kind: 'error', text: 'Falha de rede ao enviar.' });
    } finally {
      setSending(false);
      setShowConfirm(false);
    }
  }

  async function viewDeliveries(broadcastId: string) {
    setDeliveries({ broadcastId, rows: [] });
    setDeliveriesLoading(true);
    setDeliveriesError(null);
    try {
      const res = await fetch(`/api/v1/admin/broadcasts?broadcastId=${encodeURIComponent(broadcastId)}`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        setDeliveriesError(json.error ?? 'Falha ao carregar entregas.');
      } else {
        setDeliveries({ broadcastId, rows: json.data?.deliveries ?? [] });
      }
    } catch {
      setDeliveriesError('Falha de rede ao carregar entregas.');
    } finally {
      setDeliveriesLoading(false);
    }
  }

  return (
    <div data-testid="admin-broadcasts" className="space-y-8">
      {banner && (
        <div
          role="status"
          className={`rounded-md px-4 py-3 text-sm ${
            banner.kind === 'success'
              ? 'bg-primary/10 text-primary'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* Composer */}
      <section data-testid="form-broadcast" className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold text-foreground mb-4">Novo broadcast</h2>
        <div className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-foreground">Segmento</span>
            <select
              data-testid="form-broadcast-segment-select"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              disabled={sending}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              {SEGMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium text-foreground">Assunto</span>
            <input
              data-testid="form-broadcast-subject-input"
              type="text"
              value={subject}
              maxLength={180}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
              placeholder="Assunto do email"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium text-foreground">Conteudo (HTML)</span>
            <textarea
              data-testid="form-broadcast-html-textarea"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              disabled={sending}
              rows={8}
              placeholder="<p>Ola!</p>"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono"
            />
            <span className="text-xs text-muted-foreground">
              Um rodape de descadastro (unsubscribe) e adicionado automaticamente.
            </span>
          </label>

          <div>
            <button
              type="button"
              data-testid="admin-broadcasts-send-button"
              onClick={requestSend}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Enviar broadcast
            </button>
          </div>
        </div>
      </section>

      {/* History */}
      <section data-testid="admin-broadcasts-history">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">Historico de broadcasts</h2>
          <button
            type="button"
            data-testid="admin-broadcasts-refresh-button"
            onClick={() => load()}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>

        {loading ? (
          <p data-testid="admin-broadcasts-loading" className="text-sm text-muted-foreground py-6">Carregando broadcasts...</p>
        ) : listError ? (
          <p data-testid="admin-broadcasts-error" className="text-sm text-destructive py-6">{listError}</p>
        ) : items.length === 0 ? (
          <p data-testid="admin-broadcasts-empty" className="text-sm text-muted-foreground py-6">Nenhum broadcast enviado ainda.</p>
        ) : (
          <div data-testid="admin-broadcasts-table" className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Segmento</th>
                  <th className="px-4 py-2 font-medium">Assunto</th>
                  <th className="px-4 py-2 font-medium">Enviados</th>
                  <th className="px-4 py-2 font-medium">Falhas</th>
                  <th className="px-4 py-2 font-medium">Pulados</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.broadcastId} data-testid={`admin-broadcasts-row-${row.broadcastId}`} className="border-t border-border">
                    <td className="px-4 py-2 text-foreground whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2 text-foreground">{segmentLabel(row.segment)}</td>
                    <td className="px-4 py-2 text-foreground max-w-[260px] truncate">{row.subject ?? '—'}</td>
                    <td className="px-4 py-2 text-foreground">{row.sent}</td>
                    <td className="px-4 py-2 text-foreground">{row.failed}</td>
                    <td className="px-4 py-2 text-foreground">{row.skipped}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        data-testid={`admin-broadcasts-view-deliveries-${row.broadcastId}-button`}
                        onClick={() => viewDeliveries(row.broadcastId)}
                        className="inline-flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <Eye className="h-4 w-4" />
                        Ver entregas
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Confirm dialog */}
      {showConfirm && (
        <div data-testid="modal-confirm-broadcast" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-foreground">Confirmar envio</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Voce vai enviar este broadcast para o segmento{' '}
                  <strong className="text-foreground">{segmentLabel(segment)}</strong>. Quem cancelou o
                  recebimento (unsubscribe) nao sera contatado. Esta acao nao pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                data-testid="modal-confirm-broadcast-cancel-button"
                onClick={() => setShowConfirm(false)}
                disabled={sending}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="modal-confirm-broadcast-submit-button"
                onClick={confirmSend}
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {sending ? 'Enviando...' : 'Confirmar envio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deliveries panel */}
      {deliveries && (
        <div data-testid="modal-broadcast-deliveries" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl max-h-[80vh] overflow-hidden rounded-lg border border-border bg-card shadow-lg flex flex-col">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-base font-semibold text-foreground">Entregas do broadcast</h3>
              <button
                type="button"
                data-testid="modal-broadcast-deliveries-close-button"
                onClick={() => setDeliveries(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              {deliveriesLoading ? (
                <p className="text-sm text-muted-foreground py-6">Carregando entregas...</p>
              ) : deliveriesError ? (
                <p className="text-sm text-destructive py-6">{deliveriesError}</p>
              ) : deliveries.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6">Nenhuma entrega registrada.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 font-medium">Destinatario</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Provider</th>
                      <th className="px-2 py-2 font-medium">Provider ID</th>
                      <th className="px-2 py-2 font-medium">Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.rows.map((d) => (
                      <tr key={d.id} className="border-t border-border align-top">
                        <td className="px-2 py-2 text-foreground">{d.toEmail}</td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs ${
                              STATUS_CLASS[d.status] ?? 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{d.provider ?? '—'}</td>
                        <td className="px-2 py-2 text-muted-foreground font-mono text-xs break-all">
                          {d.providerMessageId ?? '—'}
                        </td>
                        <td className="px-2 py-2 text-destructive text-xs">
                          {d.errorCode ? `${d.errorCode}${d.errorMessage ? `: ${d.errorMessage}` : ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
