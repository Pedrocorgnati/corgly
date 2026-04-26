'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';

interface ContentItem {
  id:          string;
  title:       string;
  status:      string;
  category:    string | null;
  publishedAt: string | null;
  updatedAt:   string;
  translations: Array<{ locale: string; title: string; slug: string }>;
}

export function ContentList() {
  const [items, setItems]   = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('');
  const [q, setQ]           = useState<string>('');

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q)      params.set('q', q);
      try {
        const res = await fetch(`/api/v1/admin/content?${params}`, { credentials: 'include', signal: controller.signal });
        const json = await res.json();
        if (res.ok) setItems(json.data?.items ?? []);
      } catch {/* aborted */}
      setLoading(false);
    })();
    return () => controller.abort();
  }, [status, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..."
                 className="rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="">Todos status</option>
          <option value="DRAFT">Rascunho</option>
          <option value="SCHEDULED">Agendado</option>
          <option value="PUBLISHED">Publicado</option>
          <option value="ARCHIVED">Arquivado</option>
        </select>
        <Link href="/admin/content/new"
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
          <Plus className="h-4 w-4" /> Novo conteudo
        </Link>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 px-4">Titulo</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4">Locales</th>
              <th className="py-2 px-4">Publicado</th>
              <th className="py-2 px-4">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum conteudo encontrado.</td></tr>
            ) : items.map((it) => (
              <tr key={it.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 px-4">
                  <Link href={`/admin/content/${it.id}`} className="font-medium text-foreground hover:text-primary">
                    {it.title}
                  </Link>
                  {it.category && <span className="ml-2 text-xs text-muted-foreground">· {it.category}</span>}
                </td>
                <td className="py-2 px-4">
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">{it.status}</span>
                </td>
                <td className="py-2 px-4 text-xs text-muted-foreground">
                  {it.translations.map((t) => t.locale).join(', ')}
                </td>
                <td className="py-2 px-4 text-xs text-muted-foreground">
                  {it.publishedAt ? new Date(it.publishedAt).toISOString().slice(0, 16).replace('T', ' ') : '—'}
                </td>
                <td className="py-2 px-4 text-xs text-muted-foreground">
                  {new Date(it.updatedAt).toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
