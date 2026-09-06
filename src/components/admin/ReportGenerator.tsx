'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

type ReportType = 'financial' | 'sessions' | 'users' | 'feedback';
type Format = 'csv' | 'xlsx';

const TYPES: Array<{ value: ReportType; label: string }> = [
  { value: 'financial', label: 'Financeiro' },
  { value: 'sessions',  label: 'Sessoes' },
  { value: 'users',     label: 'Usuarios' },
  { value: 'feedback',  label: 'Feedback' },
];

export function ReportGenerator({ onDownloaded }: { onDownloaded?: () => void }) {
  const [type, setType]     = useState<ReportType>('sessions');
  const [format, setFormat] = useState<Format>('csv');
  const [from, setFrom]     = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo]         = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<string>('');
  const [language, setLanguage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleDownload(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ format });
      if (from) params.set('from', new Date(from).toISOString());
      if (to)   params.set('to', new Date(`${to}T23:59:59`).toISOString());
      if (status)   params.set('status', status);
      if (language) params.set('language', language);

      const res = await fetch(`/api/v1/admin/reports/${type}?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const cd   = res.headers.get('content-disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(cd);
      a.href = url;
      a.download = match?.[1] ?? `report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onDownloaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar relatorio');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form data-testid="admin-reports-generator" onSubmit={handleDownload} className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
      <h2 data-testid="admin-reports-generator-header" className="font-semibold text-foreground">Gerar relatorio</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm">
          <span className="block mb-1 text-muted-foreground">Tipo</span>
          <select
            data-testid="admin-reports-type-select"
            value={type}
            onChange={(e) => setType(e.target.value as ReportType)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
          >
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>

        <label className="text-sm">
          <span className="block mb-1 text-muted-foreground">Formato</span>
          <select
            data-testid="admin-reports-format-select"
            value={format}
            onChange={(e) => setFormat(e.target.value as Format)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
          >
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="block mb-1 text-muted-foreground">De</span>
          <input data-testid="admin-reports-from-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                 className="w-full rounded-lg border border-border bg-background px-3 py-2" />
        </label>

        <label className="text-sm">
          <span className="block mb-1 text-muted-foreground">Ate</span>
          <input data-testid="admin-reports-to-input" type="date" value={to} onChange={(e) => setTo(e.target.value)}
                 className="w-full rounded-lg border border-border bg-background px-3 py-2" />
        </label>

        <label className="text-sm">
          <span className="block mb-1 text-muted-foreground">Status (opcional)</span>
          <input data-testid="admin-reports-status-input" type="text" value={status} onChange={(e) => setStatus(e.target.value)}
                 placeholder="Ex.: COMPLETED, SUCCEEDED"
                 className="w-full rounded-lg border border-border bg-background px-3 py-2" />
        </label>

        <label className="text-sm">
          <span className="block mb-1 text-muted-foreground">Idioma (users)</span>
          <select data-testid="admin-reports-language-select" value={language} onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2">
            <option value="">Todos</option>
            <option value="PT_BR">pt-BR</option>
            <option value="EN_US">en-US</option>
            <option value="ES_ES">es-ES</option>
            <option value="IT_IT">it-IT</option>
          </select>
        </label>
      </div>

      {error && <p data-testid="admin-reports-generator-error" className="text-sm text-destructive">{error}</p>}

      <button
        data-testid="admin-reports-download-button"
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {loading ? 'Gerando...' : 'Baixar'}
      </button>
    </form>
  );
}
