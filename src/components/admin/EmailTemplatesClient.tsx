'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Eye, Send, Archive, X, RefreshCw } from 'lucide-react';
import {
  EMAIL_TEMPLATE_TYPES,
  EMAIL_TEMPLATE_LOCALES,
  EMAIL_TEMPLATE_STATUSES,
} from '@/lib/email/email-template.schema';

interface TemplateRow {
  id: string;
  type: string;
  locale: string;
  channel: string;
  version: number;
  status: string;
  subject: string;
  preheader: string | null;
  variables: unknown;
  publishedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
}

interface PreviewResult {
  html: string;
  usedVariables: string[];
  unknownVariables: string[];
  safe: boolean;
}

type Banner = { kind: 'success' | 'error'; text: string } | null;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Publicado',
  ARCHIVED: 'Arquivado',
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-primary/15 text-primary',
  ARCHIVED: 'bg-destructive/10 text-destructive',
};

export function EmailTemplatesClient() {
  const [items, setItems] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [preview, setPreview] = useState<{ row: TemplateRow; data: PreviewResult } | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      try {
        const res = await fetch(`/api/v1/email-templates?${params}`, {
          credentials: 'include',
          signal,
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? 'Falha ao carregar templates.');
          setItems([]);
        } else {
          setItems(json.data?.items ?? []);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError('Falha de rede ao carregar.');
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, typeFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function act(row: TemplateRow, action: 'publish' | 'archive') {
    setBusyId(row.id);
    setBanner(null);
    try {
      const res = await fetch(`/api/v1/email-templates/${row.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) {
        setBanner({ kind: 'error', text: json.error ?? 'Acao falhou.' });
      } else {
        setBanner({
          kind: 'success',
          text: action === 'publish' ? 'Versao publicada.' : 'Versao arquivada.',
        });
        await load();
      }
    } catch {
      setBanner({ kind: 'error', text: 'Falha de rede.' });
    } finally {
      setBusyId(null);
    }
  }

  async function openPreview(row: TemplateRow) {
    setBusyId(row.id);
    setBanner(null);
    try {
      const res = await fetch(`/api/v1/email-templates/${row.id}?preview=1`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok || !json.data?.preview) {
        setBanner({ kind: 'error', text: json.error ?? 'Falha ao gerar preview.' });
      } else {
        setPreview({ row, data: json.data.preview as PreviewResult });
      }
    } catch {
      setBanner({ kind: 'error', text: 'Falha de rede no preview.' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {banner && (
        <div
          role="status"
          className={`rounded-lg px-4 py-2 text-sm ${
            banner.kind === 'success'
              ? 'bg-primary/10 text-primary'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos os tipos</option>
          {EMAIL_TEMPLATE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          {EMAIL_TEMPLATE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Nova versao
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 px-4">Tipo</th>
              <th className="py-2 px-4">Locale</th>
              <th className="py-2 px-4">Versao</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4">Assunto</th>
              <th className="py-2 px-4 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-destructive">
                  {error}{' '}
                  <button type="button" onClick={() => load()} className="underline">
                    Tentar novamente
                  </button>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhum template encontrado.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 px-4 font-medium text-foreground">{it.type}</td>
                  <td className="py-2 px-4">{it.locale}</td>
                  <td className="py-2 px-4">v{it.version}</td>
                  <td className="py-2 px-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                        STATUS_CLASS[it.status] ?? 'bg-muted'
                      }`}
                    >
                      {STATUS_LABEL[it.status] ?? it.status}
                    </span>
                  </td>
                  <td className="py-2 px-4 max-w-[18rem] truncate">{it.subject}</td>
                  <td className="py-2 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openPreview(it)}
                        disabled={busyId === it.id}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" /> Preview
                      </button>
                      {it.status === 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() => act(it, 'publish')}
                          disabled={busyId === it.id}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
                          title="Publicar"
                        >
                          <Send className="h-4 w-4" /> Publicar
                        </button>
                      )}
                      {it.status !== 'ARCHIVED' && (
                        <button
                          type="button"
                          onClick={() => act(it, 'archive')}
                          disabled={busyId === it.id}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          title="Arquivar"
                        >
                          <Archive className="h-4 w-4" /> Arquivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateVersionModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            setBanner({ kind: 'success', text: 'Nova versao criada em rascunho.' });
            await load();
          }}
          onError={(text) => setBanner({ kind: 'error', text })}
        />
      )}

      {preview && (
        <PreviewModal
          row={preview.row}
          data={preview.data}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function CreateVersionModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (text: string) => void;
}) {
  const [type, setType] = useState<string>(EMAIL_TEMPLATE_TYPES[0]);
  const [locale, setLocale] = useState<string>(EMAIL_TEMPLATE_LOCALES[0]);
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [variables, setVariables] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/email-templates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          locale,
          subject,
          htmlBody,
          variables: variables
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onError(json.error ?? 'Falha ao criar versao.');
      } else {
        onCreated();
      }
    } catch {
      onError('Falha de rede ao criar versao.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nova versao de template" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-muted-foreground">Tipo</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            >
              {EMAIL_TEMPLATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Locale</span>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            >
              {EMAIL_TEMPLATE_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-muted-foreground">Assunto</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            maxLength={180}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">
            Variaveis permitidas (separadas por virgula)
          </span>
          <input
            value={variables}
            onChange={(e) => setVariables(e.target.value)}
            placeholder="user_name, action_url"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">
            HTML do corpo (sem script, iframe ou handlers inline)
          </span>
          <textarea
            value={htmlBody}
            onChange={(e) => setHtmlBody(e.target.value)}
            required
            rows={8}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
          />
        </label>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Criando...' : 'Criar rascunho'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PreviewModal({
  row,
  data,
  onClose,
}: {
  row: TemplateRow;
  data: PreviewResult;
  onClose: () => void;
}) {
  return (
    <Modal title={`Preview — ${row.type} v${row.version} (${row.locale})`} onClose={onClose}>
      <div className="space-y-3">
        {!data.safe && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Conteudo bloqueado: o HTML renderizado contem elementos inseguros.
          </div>
        )}
        {data.unknownVariables.length > 0 && (
          <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Variaveis fora da allowlist (nao interpoladas):{' '}
            {data.unknownVariables.join(', ')}
          </div>
        )}
        {/* iframe sandbox sem allow-scripts: o preview nunca executa JS. */}
        <iframe
          title="Preview do template"
          sandbox=""
          srcDoc={data.html}
          className="h-80 w-full rounded-lg border border-border bg-white"
        />
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-card border border-border p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
