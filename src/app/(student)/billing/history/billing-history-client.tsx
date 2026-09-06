'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { getRegionalDisplay } from '@/lib/billing/currency-policy';
import { toCurrency } from '@/lib/currency';

type Status = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';

interface HistoryItem {
  id: string;
  createdAt: string;
  description: string;
  amount: number;
  currency: string;
  status: Status;
  receiptAvailable: boolean;
}

const STATUS_FILTERS: Array<{ label: string; value: '' | Status }> = [
  { label: 'Todos', value: '' },
  { label: 'Pagos', value: 'SUCCEEDED' },
  { label: 'Estornados', value: 'REFUNDED' },
  { label: 'Falhos', value: 'FAILED' },
];

const STATUS_COLOR: Record<Status, string> = {
  PENDING: 'text-amber-600',
  SUCCEEDED: 'text-emerald-600',
  FAILED: 'text-red-600',
  REFUNDED: 'text-blue-600',
};

export function BillingHistoryClient() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'' | Status>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set('limit', '20');
        if (!reset && cursor) qs.set('cursor', cursor);
        if (status) qs.set('status', status);
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        const res = await fetch(`/api/v1/billing/history?${qs.toString()}`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Erro ao carregar extrato');
        const data = json.data as { items: HistoryItem[]; nextCursor: string | null };
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        setCursor(data.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    },
    [cursor, status, from, to],
  );

  // Reset + reload when filters change
  useEffect(() => {
    setCursor(null);
    setItems([]);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, from, to]);

  async function handleDownload(id: string) {
    setDownloading(id);
    try {
      const res = await fetch(`/api/v1/billing/receipt/${id}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Falha ao gerar recibo');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao baixar recibo');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div data-testid="billing-history-list" className="flex flex-col gap-4">
      {/* Filters */}
      <div data-testid="billing-history-filter-bar" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">De</label>
          <input
            data-testid="billing-history-filter-from-input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Até</label>
          <input
            data-testid="billing-history-filter-to-input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s.value || 'all'}
              data-testid={`billing-history-filter-${(s.value || 'all').toLowerCase()}-button`}
              type="button"
              variant={status === s.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatus(s.value)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div
          data-testid="billing-history-error"
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Table */}
      {items.length === 0 && !loading ? (
        <EmptyState
          data-testid="billing-history-empty"
          title="Nenhum pagamento encontrado"
          description="Seus pagamentos aparecerão aqui."
        />
      ) : (
        <div data-testid="billing-history-table" className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Moeda</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} data-testid={`billing-history-row-${it.id}`} className="border-t border-border">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(it.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">{it.description}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {getRegionalDisplay(it.amount, toCurrency(it.currency), 'pt-BR').formatted}
                  </td>
                  <td className="px-4 py-3 uppercase">{it.currency}</td>
                  <td className={`px-4 py-3 font-medium ${STATUS_COLOR[it.status]}`}>
                    {it.status}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {it.receiptAvailable ? (
                      <Button
                        data-testid={`billing-history-download-${it.id}-button`}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={downloading === it.id}
                        onClick={() => handleDownload(it.id)}
                      >
                        {downloading === it.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        <span className="ml-2">Recibo</span>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div data-testid="billing-history-pagination" className="flex justify-center">
        {cursor && (
          <Button data-testid="billing-history-load-more-button" type="button" variant="outline" onClick={() => load(false)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Carregar mais'}
          </Button>
        )}
        {loading && !cursor && items.length === 0 && (
          <Loader2 data-testid="billing-history-loading" className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
