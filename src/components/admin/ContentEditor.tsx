'use client';

import { useEffect, useMemo, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Calendar, Send, Eye, Trash2 } from 'lucide-react';
import { slugify } from '@/lib/content/slug';

type Locale = 'PT_BR' | 'EN_US' | 'ES_ES' | 'IT_IT';
type Status = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: 'PT_BR', label: 'pt-BR' },
  { value: 'EN_US', label: 'en-US' },
  { value: 'ES_ES', label: 'es-ES' },
  { value: 'IT_IT', label: 'it-IT' },
];

interface Translation {
  locale:  Locale;
  title:   string;
  slug:    string;
  excerpt: string;
  body:    string;
}

interface ContentFormValue {
  id?:          string;
  type:         'VIDEO' | 'ARTICLE';
  title:        string;
  category:     string;
  status:       Status;
  publishedAt:  string;
  youtubeUrl:   string;
  translations: Record<Locale, Translation>;
}

const EMPTY_TRANSLATION = (locale: Locale): Translation => ({
  locale,
  title:   '',
  slug:    '',
  excerpt: '',
  body:    '',
});

function emptyForm(): ContentFormValue {
  return {
    type:        'ARTICLE',
    title:       '',
    category:    '',
    status:      'DRAFT',
    publishedAt: '',
    youtubeUrl:  '',
    translations: {
      PT_BR: EMPTY_TRANSLATION('PT_BR'),
      EN_US: EMPTY_TRANSLATION('EN_US'),
      ES_ES: EMPTY_TRANSLATION('ES_ES'),
      IT_IT: EMPTY_TRANSLATION('IT_IT'),
    },
  };
}

export function ContentEditor({ initial }: { initial?: ContentFormValue }) {
  const router = useRouter();
  const [form, setForm] = useState<ContentFormValue>(initial ?? emptyForm());
  const [activeLocale, setActiveLocale] = useState<Locale>('PT_BR');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content:    form.translations[activeLocale].body || '<p></p>',
    editorProps: { attributes: { class: 'prose prose-sm max-w-none min-h-[300px] p-4 focus:outline-none' } },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setForm((f) => ({
        ...f,
        translations: {
          ...f.translations,
          [activeLocale]: { ...f.translations[activeLocale], body: editor.getHTML() },
        },
      }));
    },
  }, [activeLocale]);

  useEffect(() => {
    if (editor) editor.commands.setContent(form.translations[activeLocale].body || '<p></p>', { emitUpdate: false });
  }, [activeLocale, editor, form.translations]);

  const canSave = useMemo(() => {
    return form.title.trim().length > 0 && Object.values(form.translations).some((t) => t.title.trim());
  }, [form]);

  async function save(status: Status, publishAt?: string) {
    setSaving(true);
    setError(null);
    try {
      const translations = Object.values(form.translations).filter((t) => t.title.trim());
      const payload = {
        type:        form.type,
        title:       form.title,
        category:    form.category || null,
        status,
        publishedAt: publishAt ?? (form.publishedAt ? new Date(form.publishedAt).toISOString() : null),
        youtubeUrl:  form.youtubeUrl || null,
        translations: translations.map((t) => ({
          locale:  t.locale,
          title:   t.title,
          slug:    t.slug || slugify(t.title),
          excerpt: t.excerpt || null,
          body:    t.body,
        })),
      };
      const url    = form.id ? `/api/v1/admin/content/${form.id}` : '/api/v1/admin/content';
      const method = form.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (!form.id && json.data?.id) {
        router.replace(`/admin/content/${json.data.id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  const t = form.translations[activeLocale];
  const updateT = (patch: Partial<Translation>) =>
    setForm((f) => ({
      ...f,
      translations: { ...f.translations, [activeLocale]: { ...f.translations[activeLocale], ...patch } },
    }));

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-destructive/10 text-destructive p-3 text-sm">{error}</div>}

      {/* Meta */}
      <div className="bg-card border border-border rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm">
          <span className="block mb-1 text-muted-foreground">Titulo interno</span>
          <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                 className="w-full rounded-lg border border-border bg-background px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="block mb-1 text-muted-foreground">Categoria</span>
          <input type="text" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                 className="w-full rounded-lg border border-border bg-background px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="block mb-1 text-muted-foreground">Tipo</span>
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as typeof f.type }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2">
            <option value="ARTICLE">Artigo</option>
            <option value="VIDEO">Video</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block mb-1 text-muted-foreground">YouTube URL (se video)</span>
          <input type="url" value={form.youtubeUrl} onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
                 className="w-full rounded-lg border border-border bg-background px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="block mb-1 text-muted-foreground">Publicar em (agendar)</span>
          <input type="datetime-local" value={form.publishedAt}
                 onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
                 className="w-full rounded-lg border border-border bg-background px-3 py-2" />
        </label>
        <div className="text-sm">
          <span className="block mb-1 text-muted-foreground">Status atual</span>
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium">{form.status}</span>
        </div>
      </div>

      {/* Locale tabs */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex border-b border-border">
          {LOCALES.map((l) => {
            const hasContent = form.translations[l.value].title.trim().length > 0;
            return (
              <button
                key={l.value}
                type="button"
                onClick={() => setActiveLocale(l.value)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                  activeLocale === l.value
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {l.label}
                {hasContent && <span className="ml-1 text-success">•</span>}
              </button>
            );
          })}
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Titulo ({activeLocale})</span>
              <input type="text" value={t.title}
                     onChange={(e) => updateT({ title: e.target.value, slug: t.slug || slugify(e.target.value) })}
                     className="w-full rounded-lg border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Slug</span>
              <input type="text" value={t.slug}
                     onChange={(e) => updateT({ slug: e.target.value })}
                     className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs" />
            </label>
          </div>
          <label className="text-sm block">
            <span className="block mb-1 text-muted-foreground">Resumo</span>
            <textarea value={t.excerpt} onChange={(e) => updateT({ excerpt: e.target.value })} rows={2}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2" />
          </label>

          <div className="border border-border rounded-lg">
            {editor && <EditorContent editor={editor} />}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving || !canSave}
                onClick={() => save('DRAFT')}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar rascunho
        </button>
        <button type="button" disabled={saving || !canSave || !form.publishedAt}
                onClick={() => save('SCHEDULED')}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">
          <Calendar className="h-4 w-4" />
          Agendar
        </button>
        <button type="button" disabled={saving || !canSave}
                onClick={() => save('PUBLISHED', new Date().toISOString())}
                className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
          <Send className="h-4 w-4" />
          Publicar
        </button>
        {form.id && t.slug && (
          <a href={`/${activeLocale.toLowerCase().replace('_', '-')}/blog/${t.slug}?preview=1`}
             target="_blank" rel="noopener"
             className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm">
            <Eye className="h-4 w-4" />
            Preview
          </a>
        )}
        {form.id && (
          <button type="button" onClick={() => save('ARCHIVED')}
                  className="inline-flex items-center gap-2 rounded-lg border border-destructive text-destructive px-4 py-2 text-sm ml-auto">
            <Trash2 className="h-4 w-4" />
            Arquivar
          </button>
        )}
      </div>
    </div>
  );
}
