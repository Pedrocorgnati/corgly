'use client';

/**
 * Editor de exercicio da biblioteca admin (item 007 do loop
 * 09-07-corgly-saas-exercicios, secao 5.3 do source).
 *
 * Formulario UNICO com tres abas (Metadados, Itens, Revisao), navegacao livre
 * e um unico submit, no padrao do `ContentEditor` — o "wizard" do plano
 * original virou abas por decisao explicita do source (5.3, opcao a). Nao
 * existe passo linear bloqueante.
 *
 * Decisoes registradas:
 * - Copy da tela em PT-BR literal (decisao 5.1 opcao a). A UNICA excecao e o
 *   rotulo do tipo do item, que vem das chaves i18n literais `exercises.kind*`
 *   (14 chaves, item 005) porque esse conteudo e compartilhado com o aluno.
 * - Select de tipo lista os 14 valores de `ExerciseItemKind`; os dez fora da
 *   Fase 1 aparecem desabilitados. O aluno nunca ve o slug.
 * - `IT_IT` e recusado na validacao com mensagem clara: a fonte nao publica
 *   italiano (`LessonContentLocale = 'pt' | 'en' | 'es'`, ver 4.6 e 8.2 do
 *   source). O service tambem recusa com 422/EXERCISE_002; a checagem aqui da
 *   o feedback antes do submit.
 * - Slots de som e imagem NAO tem UI: midia e Fase 2/3 (5.6 do source, itens
 *   fora do escopo do loop). Os campos sao enviados como null.
 * - A aba Revisao e so leitura: checklist de prontidao de publicacao (regra
 *   4.6) + resumo dos itens. O preview jogavel do professor e o item 014 e
 *   ancora no data-testid `admin-exercise-editor-review`.
 * - Reordenar e por botao sobe/desce: arrastar-e-soltar esta fora de escopo
 *   por decisao do source (secao 15).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Loader2,
  Save,
  Send,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Plus,
  CircleAlert,
  CircleCheck,
  Play,
} from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExercisePreview } from './exercises/exercise-preview';
import {
  EXERCISE_ITEM_KINDS,
  MAX_MATCH_PAIRS,
  MIN_MATCH_PAIRS,
  OPTIONS_PER_QUESTION,
  VERB_PERSONS,
  VERB_TENSES,
  type Phase1ExerciseItemKind,
} from '@/lib/exercises';
import { createExerciseSchema } from '@/schemas/exercise.schema';

// ---------------------------------------------------------------------------
// Tipos de formulario (espelham o contrato da API; nenhum escrito do Prisma)
// ---------------------------------------------------------------------------

type Locale = 'PT_BR' | 'EN_US' | 'ES_ES' | 'IT_IT';
type ExerciseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: 'PT_BR', label: 'pt-BR' },
  { value: 'EN_US', label: 'en-US' },
  { value: 'ES_ES', label: 'es-ES' },
  { value: 'IT_IT', label: 'it-IT' },
];

const SUPPORT_LANGUAGE_OPTIONS: Array<{ value: Locale; label: string }> = [
  { value: 'PT_BR', label: 'Português (pt-BR)' },
  { value: 'EN_US', label: 'Inglês (en-US)' },
  { value: 'ES_ES', label: 'Espanhol (es-ES)' },
  { value: 'IT_IT', label: 'Italiano (it-IT) — não publicado pela fonte' },
];

const PHASE_1_KINDS: readonly Phase1ExerciseItemKind[] = [
  'MULTIPLE_CHOICE',
  'MATCH_CLICK',
  'TEXT_CHOICE',
  'VERB_CLOZE',
];

/**
 * Rotulo i18n de cada kind: `exercises.kindMultipleChoice` etc. As 14 chaves
 * foram publicadas no item 005 nos quatro locales.
 */
const KIND_MESSAGE_KEY: Record<string, string> = {
  MULTIPLE_CHOICE: 'kindMultipleChoice',
  MATCH_CLICK: 'kindMatchClick',
  AUDIO_WORD: 'kindAudioWord',
  AUDIO_CLOZE: 'kindAudioCloze',
  AUDIO_SENTENCE: 'kindAudioSentence',
  AUDIO_CHOICE: 'kindAudioChoice',
  AUDIO_ORDER: 'kindAudioOrder',
  TEXT_CHOICE: 'kindTextChoice',
  VERB_CLOZE: 'kindVerbCloze',
  IMAGE_WORD: 'kindImageWord',
  IMAGE_CHOICE: 'kindImageChoice',
  IMAGE_SPEAK: 'kindImageSpeak',
  AUDIO_SHADOW: 'kindAudioShadow',
  L1_SPEAK_PT: 'kindL1SpeakPt',
};

const VERB_PERSON_LABELS: Record<string, string> = {
  EU: 'Eu',
  VOCE_ELE_ELA: 'Você / ele / ela',
  NOS: 'Nós',
  VOCES_ELES_ELAS: 'Vocês / eles / elas',
};

const VERB_TENSE_LABELS: Record<string, string> = {
  PRESENTE_INDICATIVO: 'Presente do indicativo',
};

interface ExerciseTranslationForm {
  locale: Locale;
  title: string;
  summary: string;
}

interface MatchEntryForm {
  id: string;
  text: string;
}

export interface ExerciseItemForm {
  id?: string;
  kind: Phase1ExerciseItemKind;
  acceptWithoutAccent: boolean;
  /** MULTIPLE_CHOICE e TEXT_CHOICE. */
  prompt: string;
  options: string[];
  /** -1 = admin ainda nao marcou a correta. */
  correctIndex: number;
  /** TEXT_CHOICE. */
  readingText: string;
  /** VERB_CLOZE. */
  infinitive: string;
  tense: string;
  person: string;
  sentence: string;
  canonical: string;
  /** Variantes aceitas, uma por linha. */
  acceptedText: string;
  /** MATCH_CLICK. */
  left: MatchEntryForm[];
  right: MatchEntryForm[];
  pairs: Array<{ leftId: string; rightId: string }>;
}

interface ExerciseFormValue {
  id?: string;
  internalTitle: string;
  supportLanguage: Locale;
  level: string;
  subject: string;
  tagsText: string;
  timeEstimateMin: string;
  status: ExerciseStatus;
  translations: Record<Locale, ExerciseTranslationForm>;
  items: ExerciseItemForm[];
}

export interface ExerciseEditorInitial {
  id: string;
  internalTitle: string;
  supportLanguage: Locale;
  level: number;
  subject: string | null;
  tags: string[];
  timeEstimateMin: number | null;
  status: ExerciseStatus;
  translations: Record<Locale, ExerciseTranslationForm>;
  items: ExerciseItemForm[];
}

// ---------------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------------

const EMPTY_TRANSLATION = (locale: Locale): ExerciseTranslationForm => ({
  locale,
  title: '',
  summary: '',
});

let entrySeq = 0;
function newEntryId(prefix: string): string {
  entrySeq += 1;
  return `${prefix}${entrySeq}`;
}

function emptyMatchColumn(prefix: string, size: number): MatchEntryForm[] {
  return Array.from({ length: size }, () => ({ id: newEntryId(prefix), text: '' }));
}

function emptyItem(kind: Phase1ExerciseItemKind): ExerciseItemForm {
  return {
    kind,
    acceptWithoutAccent: false,
    prompt: '',
    options: kind === 'MULTIPLE_CHOICE' ? ['', '', '', ''] : ['', ''],
    correctIndex: -1,
    readingText: '',
    infinitive: '',
    tense: VERB_TENSES[0],
    person: VERB_PERSONS[0],
    sentence: '',
    canonical: '',
    acceptedText: '',
    left: emptyMatchColumn('e', MIN_MATCH_PAIRS),
    right: emptyMatchColumn('d', MIN_MATCH_PAIRS),
    pairs: [],
  };
}

function emptyForm(): ExerciseFormValue {
  return {
    internalTitle: '',
    supportLanguage: 'PT_BR',
    level: '1',
    subject: '',
    tagsText: '',
    timeEstimateMin: '',
    status: 'DRAFT',
    translations: {
      PT_BR: EMPTY_TRANSLATION('PT_BR'),
      EN_US: EMPTY_TRANSLATION('EN_US'),
      ES_ES: EMPTY_TRANSLATION('ES_ES'),
      IT_IT: EMPTY_TRANSLATION('IT_IT'),
    },
    items: [emptyItem('MULTIPLE_CHOICE')],
  };
}

function formFromInitial(initial: ExerciseEditorInitial): ExerciseFormValue {
  return {
    id: initial.id,
    internalTitle: initial.internalTitle,
    supportLanguage: initial.supportLanguage,
    level: String(initial.level),
    subject: initial.subject ?? '',
    tagsText: initial.tags.join(', '),
    timeEstimateMin: initial.timeEstimateMin !== null ? String(initial.timeEstimateMin) : '',
    status: initial.status,
    translations: { ...initial.translations },
    items: initial.items.map((item) => ({ ...item })),
  };
}

// ---------------------------------------------------------------------------
// Montagem do payload por kind
// ---------------------------------------------------------------------------

type BuiltItem = {
  position: number;
  acceptWithoutAccent: boolean;
  maxSeconds: null;
  promptAudioAssetId: null;
  answerAudioAssetId: null;
  imageAssetId: null;
  imageAlt: null;
} & (
  | { kind: 'MULTIPLE_CHOICE'; payload: { prompt: string; options: string[] }; answerKey: { correctIndex: number } }
  | { kind: 'TEXT_CHOICE'; payload: { readingText: string; prompt: string; options: string[] }; answerKey: { correctIndex: number } }
  | { kind: 'VERB_CLOZE'; payload: { infinitive: string; tense: string; person: string; sentence: string }; answerKey: { canonical: string; accepted: string[] } }
  | { kind: 'MATCH_CLICK'; payload: { left: MatchEntryForm[]; right: MatchEntryForm[] }; answerKey: { pairs: Array<{ leftId: string; rightId: string }> } }
);

function buildItem(item: ExerciseItemForm, position: number): { item?: BuiltItem; error?: string } {
  const base = {
    position,
    acceptWithoutAccent: item.acceptWithoutAccent,
    maxSeconds: null,
    promptAudioAssetId: null,
    answerAudioAssetId: null,
    imageAssetId: null,
    imageAlt: null,
  };

  if (item.kind === 'MULTIPLE_CHOICE') {
    if (item.correctIndex < 0) {
      return { error: `Item ${position}: marque a alternativa correta.` };
    }
    return {
      item: {
        ...base,
        kind: 'MULTIPLE_CHOICE',
        payload: { prompt: item.prompt, options: item.options },
        answerKey: { correctIndex: item.correctIndex },
      },
    };
  }

  if (item.kind === 'TEXT_CHOICE') {
    if (item.correctIndex < 0) {
      return { error: `Item ${position}: marque a alternativa correta.` };
    }
    return {
      item: {
        ...base,
        kind: 'TEXT_CHOICE',
        payload: { readingText: item.readingText, prompt: item.prompt, options: item.options },
        answerKey: { correctIndex: item.correctIndex },
      },
    };
  }

  if (item.kind === 'VERB_CLOZE') {
    const accepted = item.acceptedText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    return {
      item: {
        ...base,
        kind: 'VERB_CLOZE',
        payload: {
          infinitive: item.infinitive,
          tense: item.tense,
          person: item.person,
          sentence: item.sentence,
        },
        answerKey: { canonical: item.canonical, accepted },
      },
    };
  }

  const pairs = item.pairs.filter((pair) => pair.leftId && pair.rightId);
  return {
    item: {
      ...base,
      kind: 'MATCH_CLICK',
      payload: { left: item.left, right: item.right },
      answerKey: { pairs },
    },
  };
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

type ExerciseEditorTab = 'metadata' | 'items' | 'review';

interface ExerciseEditorProps {
  initial?: ExerciseEditorInitial;
  initialTab?: ExerciseEditorTab;
  initialPreviewOpen?: boolean;
}

export function ExerciseEditor({
  initial,
  initialTab = 'metadata',
  initialPreviewOpen = false,
}: ExerciseEditorProps) {
  const router = useRouter();
  const t = useTranslations('exercises');
  const [form, setForm] = useState<ExerciseFormValue>(() =>
    initial ? formFromInitial(initial) : emptyForm(),
  );
  const [activeLocale, setActiveLocale] = useState<Locale>('PT_BR');
  const [newItemKind, setNewItemKind] = useState<Phase1ExerciseItemKind>('MULTIPLE_CHOICE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(initialPreviewOpen);

  const update = (patch: Partial<ExerciseFormValue>) => setForm((f) => ({ ...f, ...patch }));

  const updateTranslation = (locale: Locale, patch: Partial<ExerciseTranslationForm>) =>
    setForm((f) => ({
      ...f,
      translations: { ...f.translations, [locale]: { ...f.translations[locale], ...patch } },
    }));

  const updateItem = (index: number, patch: Partial<ExerciseItemForm>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  function moveItem(index: number, delta: number) {
    setForm((f) => {
      const target = index + delta;
      if (target < 0 || target >= f.items.length) return f;
      const items = [...f.items];
      const [moved] = items.splice(index, 1);
      items.splice(target, 0, moved);
      return { ...f, items };
    });
  }

  function duplicateItem(index: number) {
    setForm((f) => {
      const copy = { ...f.items[index]!, id: undefined };
      const items = [...f.items];
      items.splice(index + 1, 0, copy);
      return { ...f, items };
    });
  }

  function removeItem(index: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  }

  // -------------------------------------------------------------------------
  // Prontidao de publicacao (regra 4.6), calculada sobre o estado atual.
  // O service revalida tudo no POST /publish; isto e o feedback imediato.
  // -------------------------------------------------------------------------

  const readiness = useMemo(() => {
    const checks: Array<{ label: string; ok: boolean }> = [];
    const level = Number.parseInt(form.level, 10);
    const filledTranslations = LOCALES.filter((l) => form.translations[l.value].title.trim());

    checks.push({
      label: 'Idioma de apoio preenchido e diferente de IT_IT',
      ok: Boolean(form.supportLanguage) && form.supportLanguage !== 'IT_IT',
    });
    checks.push({ label: 'Pelo menos 1 item', ok: form.items.length >= 1 });
    checks.push({
      label: 'Nivel inteiro entre 0 e 100',
      ok: Number.isInteger(level) && level >= 0 && level <= 100,
    });
    checks.push({
      label: 'Traducao em PT_BR preenchida',
      ok: form.translations.PT_BR.title.trim().length > 0,
    });
    checks.push({
      label: `Traducao no idioma de apoio (${form.supportLanguage}) preenchida`,
      ok:
        form.supportLanguage !== 'IT_IT' &&
        form.translations[form.supportLanguage].title.trim().length > 0,
    });
    checks.push({
      label: 'Pelo menos uma traducao de titulo',
      ok: filledTranslations.length >= 1,
    });

    const itemErrors: string[] = [];
    form.items.forEach((item, index) => {
      const built = buildItem(item, index + 1);
      if (built.error) {
        itemErrors.push(built.error);
        return;
      }
      const parsed = createExerciseSchema.shape.items.element.safeParse({
        ...built.item,
        kind: built.item!.kind,
      });
      if (!parsed.success) {
        itemErrors.push(
          `Item ${index + 1}: ${parsed.error.issues[0]?.message ?? 'conteudo recusado'}`,
        );
      }
    });
    checks.push({ label: 'Gabarito valido em todos os itens', ok: itemErrors.length === 0 });

    return { checks, itemErrors };
  }, [form]);

  const canPublish = readiness.checks.every((check) => check.ok);

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  function buildPayload(): { payload?: Record<string, unknown>; error?: string } {
    if (form.supportLanguage === 'IT_IT') {
      return {
        error:
          'Italiano (IT_IT) nao pode ser idioma de apoio: a fonte nao publica conteudo em italiano. O aluno com interface em italiano le a versao em ingles. Escolha pt-BR, en-US ou es-ES.',
      };
    }

    const level = Number.parseInt(form.level, 10);
    const timeEstimateMin = form.timeEstimateMin.trim()
      ? Number.parseInt(form.timeEstimateMin, 10)
      : null;
    const tags = form.tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const translations = LOCALES.map((l) => form.translations[l.value]).filter((tr) =>
      tr.title.trim(),
    );

    const items: Record<string, unknown>[] = [];
    for (let index = 0; index < form.items.length; index += 1) {
      const built = buildItem(form.items[index]!, index + 1);
      if (built.error) return { error: built.error };
      if (built.item) items.push({ ...built.item, id: form.items[index]!.id });
    }

    const payload = {
      internalTitle: form.internalTitle,
      supportLanguage: form.supportLanguage,
      level,
      subject: form.subject.trim() || null,
      tags,
      timeEstimateMin,
      translations: translations.map((tr) => ({
        locale: tr.locale,
        title: tr.title,
        summary: tr.summary.trim() || null,
      })),
      items,
    };

    const parsed = createExerciseSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue && issue.path.length > 0 ? ` (${issue.path.join('.')})` : '';
      return { error: `${issue?.message ?? 'Dados invalidos.'}${where}` };
    }

    return { payload };
  }

  /** Salva (cria ou atualiza). Retorna o id do exercicio ou null em falha. */
  async function save(): Promise<string | null> {
    const built = buildPayload();
    if (built.error || !built.payload) {
      setError(built.error ?? 'Dados invalidos.');
      return null;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const url = form.id
        ? `/api/v1/admin/exercises/${form.id}`
        : '/api/v1/admin/exercises';
      const method = form.id ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(built.payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      const id = (json.data?.id as string | undefined) ?? form.id ?? null;
      if (!form.id && id) {
        setForm((f) => ({ ...f, id }));
        router.replace(`/admin/exercises/${id}`);
      } else {
        router.refresh();
      }
      return id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    const id = await save();
    if (id) setNotice('Rascunho salvo.');
  }

  async function publish() {
    const id = form.id ?? (await save());
    if (!id) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/admin/exercises/${id}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setForm((f) => ({ ...f, id, status: 'PUBLISHED' }));
      setNotice('Exercicio publicado.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar');
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!form.id) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/admin/exercises/${form.id}/archive`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setForm((f) => ({ ...f, status: 'ARCHIVED' }));
      setNotice('Exercicio arquivado.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao arquivar');
    } finally {
      setSaving(false);
    }
  }

  const tr = form.translations[activeLocale];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div data-testid="admin-exercise-editor" className="space-y-4">
      {error && (
        <div
          data-testid="admin-exercise-editor-error"
          role="alert"
          className="rounded-lg bg-destructive/10 text-destructive p-3 text-sm"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          data-testid="admin-exercise-editor-notice"
          role="status"
          className="rounded-lg bg-success/10 text-success p-3 text-sm"
        >
          {notice}
        </div>
      )}

      <Tabs defaultValue={initialTab}>
        <TabsList className="w-full sm:w-auto overflow-x-auto min-h-[44px]">
          <TabsTrigger
            data-testid="admin-exercise-editor-tab-metadata-button"
            value="metadata"
            className="min-h-[40px] min-w-[44px]"
          >
            Metadados
          </TabsTrigger>
          <TabsTrigger
            data-testid="admin-exercise-editor-tab-items-button"
            value="items"
            className="min-h-[40px] min-w-[44px]"
          >
            Itens{form.items.length > 0 ? ` (${form.items.length})` : ''}
          </TabsTrigger>
          <TabsTrigger
            data-testid="admin-exercise-editor-tab-review-button"
            value="review"
            className="min-h-[40px] min-w-[44px]"
          >
            Revisao
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------- */}
        {/* Aba 1 — Metadados                                             */}
        {/* ------------------------------------------------------------- */}
        <TabsContent data-testid="admin-exercise-editor-tab-metadata" value="metadata" className="mt-4 space-y-4">
          <div
            data-testid="admin-exercise-editor-meta"
            className="bg-card border border-border rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Titulo interno (so o admin ve)</span>
              <input
                data-testid="form-exercise-title-input"
                type="text"
                value={form.internalTitle}
                onChange={(e) => update({ internalTitle: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Idioma de apoio</span>
              <select
                data-testid="form-exercise-support-language-select"
                value={form.supportLanguage}
                onChange={(e) => update({ supportLanguage: e.target.value as Locale })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              >
                {SUPPORT_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Nivel (inteiro, mesmo eixo da aula)</span>
              <input
                data-testid="form-exercise-level-input"
                type="number"
                min={0}
                max={100}
                step={1}
                value={form.level}
                onChange={(e) => update({ level: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Materia</span>
              <input
                data-testid="form-exercise-subject-input"
                type="text"
                value={form.subject}
                onChange={(e) => update({ subject: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Tags (separadas por virgula)</span>
              <input
                data-testid="form-exercise-tags-input"
                type="text"
                value={form.tagsText}
                onChange={(e) => update({ tagsText: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Estimativa de tempo (minutos)</span>
              <input
                data-testid="form-exercise-time-input"
                type="number"
                min={1}
                max={600}
                step={1}
                value={form.timeEstimateMin}
                onChange={(e) => update({ timeEstimateMin: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2"
              />
            </label>
            <div data-testid="admin-exercise-editor-status" className="text-sm">
              <span className="block mb-1 text-muted-foreground">Status atual</span>
              <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium">
                {form.status}
              </span>
            </div>
          </div>

          {/* Titulos e resumos por locale (ExerciseTranslation, uma linha por locale). */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div data-testid="admin-exercise-editor-locale-tabs" className="flex border-b border-border overflow-x-auto">
              {LOCALES.map((l) => {
                const hasContent = form.translations[l.value].title.trim().length > 0;
                return (
                  <button
                    key={l.value}
                    data-testid={`admin-exercise-editor-locale-tab-${l.value.toLowerCase()}-button`}
                    type="button"
                    onClick={() => setActiveLocale(l.value)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition min-h-[40px] ${
                      activeLocale === l.value
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {l.label}
                    {l.value === 'PT_BR' && <span className="ml-1 text-xs">(obrigatorio)</span>}
                    {hasContent && <span className="ml-1 text-success">•</span>}
                  </button>
                );
              })}
            </div>

            <div className="p-4 space-y-3">
              <label className="text-sm block">
                <span className="block mb-1 text-muted-foreground">Titulo do aluno ({activeLocale})</span>
                <input
                  data-testid="form-exercise-locale-title-input"
                  type="text"
                  value={tr.title}
                  onChange={(e) => updateTranslation(activeLocale, { title: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="text-sm block">
                <span className="block mb-1 text-muted-foreground">Resumo ({activeLocale})</span>
                <textarea
                  data-testid="form-exercise-locale-summary-input"
                  value={tr.summary}
                  onChange={(e) => updateTranslation(activeLocale, { summary: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              </label>
            </div>
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* Aba 2 — Itens                                                 */}
        {/* ------------------------------------------------------------- */}
        <TabsContent data-testid="admin-exercise-editor-tab-items" value="items" className="mt-4 space-y-4">
          <div data-testid="admin-exercise-editor-add-item" className="flex flex-wrap items-center gap-2">
            <label className="text-sm flex items-center gap-2">
              <span className="text-muted-foreground">Tipo</span>
              <select
                data-testid="form-exercise-new-item-kind-select"
                value={newItemKind}
                onChange={(e) => setNewItemKind(e.target.value as Phase1ExerciseItemKind)}
                className="rounded-lg border border-border bg-background px-3 py-2"
              >
                {EXERCISE_ITEM_KINDS.map((kind) => {
                  const key = KIND_MESSAGE_KEY[kind];
                  return (
                    <option
                      key={kind}
                      value={kind}
                      disabled={!PHASE_1_KINDS.includes(kind as Phase1ExerciseItemKind)}
                    >
                      {key ? t(key as never) : kind}
                      {!PHASE_1_KINDS.includes(kind as Phase1ExerciseItemKind) ? ' (Fase 2)' : ''}
                    </option>
                  );
                })}
              </select>
            </label>
            <button
              data-testid="admin-exercise-editor-add-item-button"
              type="button"
              onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem(newItemKind)] }))}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"
            >
              <Plus className="h-4 w-4" />
              Adicionar item
            </button>
          </div>

          {form.items.length === 0 && (
            <div
              data-testid="admin-exercise-editor-items-empty"
              className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
            >
              Nenhum item ainda. Adicione o primeiro item para poder salvar.
            </div>
          )}

          {form.items.map((item, index) => (
            <div
              key={item.id ?? `new-${index}`}
              data-testid={`admin-exercise-editor-item-${index + 1}`}
              className="bg-card border border-border rounded-2xl p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  Item {index + 1} — {t(KIND_MESSAGE_KEY[item.kind] as never)}
                </span>
                <div className="flex gap-1 ml-auto">
                  <button
                    data-testid={`admin-exercise-editor-item-${index + 1}-up-button`}
                    type="button"
                    onClick={() => moveItem(index, -1)}
                    disabled={index === 0}
                    aria-label={`Subir item ${index + 1}`}
                    className="inline-flex items-center rounded-lg border border-border p-2 text-sm disabled:opacity-50"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    data-testid={`admin-exercise-editor-item-${index + 1}-down-button`}
                    type="button"
                    onClick={() => moveItem(index, 1)}
                    disabled={index === form.items.length - 1}
                    aria-label={`Descer item ${index + 1}`}
                    className="inline-flex items-center rounded-lg border border-border p-2 text-sm disabled:opacity-50"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    data-testid={`admin-exercise-editor-item-${index + 1}-duplicate-button`}
                    type="button"
                    onClick={() => duplicateItem(index)}
                    aria-label={`Duplicar item ${index + 1}`}
                    className="inline-flex items-center rounded-lg border border-border p-2 text-sm"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    data-testid={`admin-exercise-editor-item-${index + 1}-delete-button`}
                    type="button"
                    onClick={() => removeItem(index)}
                    aria-label={`Excluir item ${index + 1}`}
                    className="inline-flex items-center rounded-lg border border-destructive text-destructive p-2 text-sm"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {(item.kind === 'MULTIPLE_CHOICE' || item.kind === 'TEXT_CHOICE') && (
                <div className="space-y-3">
                  {item.kind === 'TEXT_CHOICE' && (
                    <label className="text-sm block">
                      <span className="block mb-1 text-muted-foreground">Bloco de leitura (texto puro)</span>
                      <textarea
                        data-testid={`form-exercise-item-${index + 1}-reading-input`}
                        value={item.readingText}
                        onChange={(e) => updateItem(index, { readingText: e.target.value })}
                        rows={4}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 whitespace-pre-wrap"
                      />
                    </label>
                  )}
                  <label className="text-sm block">
                    <span className="block mb-1 text-muted-foreground">Enunciado</span>
                    <input
                      data-testid={`form-exercise-item-${index + 1}-prompt-input`}
                      type="text"
                      value={item.prompt}
                      onChange={(e) => updateItem(index, { prompt: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <fieldset className="space-y-2">
                    <legend className="text-sm text-muted-foreground mb-1">
                      Alternativas
                      {item.kind === 'MULTIPLE_CHOICE'
                        ? ` (exatamente ${OPTIONS_PER_QUESTION})`
                        : ' (de 2 a 5; deixe as sobrando vazias)'}
                    </legend>
                    {item.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center gap-2">
                        <input
                          data-testid={`form-exercise-item-${index + 1}-option-${optionIndex + 1}-correct-radio`}
                          type="radio"
                          name={`item-${index}-correct`}
                          checked={item.correctIndex === optionIndex}
                          onChange={() => updateItem(index, { correctIndex: optionIndex })}
                          aria-label={`Alternativa ${optionIndex + 1} e a correta`}
                          className="h-4 w-4"
                        />
                        <input
                          data-testid={`form-exercise-item-${index + 1}-option-${optionIndex + 1}-input`}
                          type="text"
                          value={option}
                          onChange={(e) =>
                            updateItem(index, {
                              options: item.options.map((o, i) =>
                                i === optionIndex ? e.target.value : o,
                              ),
                            })
                          }
                          placeholder={`Alternativa ${optionIndex + 1}`}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2"
                        />
                      </div>
                    ))}
                    {item.kind === 'TEXT_CHOICE' && item.options.length < 5 && (
                      <button
                        data-testid={`form-exercise-item-${index + 1}-add-option-button`}
                        type="button"
                        onClick={() => updateItem(index, { options: [...item.options, ''] })}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs"
                      >
                        <Plus className="h-3 w-3" />
                        Adicionar alternativa
                      </button>
                    )}
                  </fieldset>
                </div>
              )}

              {item.kind === 'VERB_CLOZE' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="text-sm">
                      <span className="block mb-1 text-muted-foreground">Infinitivo</span>
                      <input
                        data-testid={`form-exercise-item-${index + 1}-infinitive-input`}
                        type="text"
                        value={item.infinitive}
                        onChange={(e) => updateItem(index, { infinitive: e.target.value })}
                        placeholder="falar"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="block mb-1 text-muted-foreground">Tempo verbal</span>
                      <select
                        data-testid={`form-exercise-item-${index + 1}-tense-select`}
                        value={item.tense}
                        onChange={(e) => updateItem(index, { tense: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2"
                      >
                        {VERB_TENSES.map((tense) => (
                          <option key={tense} value={tense}>
                            {VERB_TENSE_LABELS[tense] ?? tense}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="block mb-1 text-muted-foreground">Pessoa</span>
                      <select
                        data-testid={`form-exercise-item-${index + 1}-person-select`}
                        value={item.person}
                        onChange={(e) => updateItem(index, { person: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2"
                      >
                        {VERB_PERSONS.map((person) => (
                          <option key={person} value={person}>
                            {VERB_PERSON_LABELS[person] ?? person}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="text-sm block">
                    <span className="block mb-1 text-muted-foreground">
                      Frase com a lacuna (use {'{{verbo}}'} exatamente uma vez)
                    </span>
                    <input
                      data-testid={`form-exercise-item-${index + 1}-sentence-input`}
                      type="text"
                      value={item.sentence}
                      onChange={(e) => updateItem(index, { sentence: e.target.value })}
                      placeholder="Eu {{verbo}} com os amigos todo fim de semana."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="text-sm block">
                    <span className="block mb-1 text-muted-foreground">Forma canonica do verbo</span>
                    <input
                      data-testid={`form-exercise-item-${index + 1}-canonical-input`}
                      type="text"
                      value={item.canonical}
                      onChange={(e) => updateItem(index, { canonical: e.target.value })}
                      placeholder="falo"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="text-sm block">
                    <span className="block mb-1 text-muted-foreground">
                      Variantes aceitas (uma por linha; opcional)
                    </span>
                    <textarea
                      data-testid={`form-exercise-item-${index + 1}-accepted-input`}
                      value={item.acceptedText}
                      onChange={(e) => updateItem(index, { acceptedText: e.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="text-sm flex items-center gap-2">
                    <input
                      data-testid={`form-exercise-item-${index + 1}-accent-checkbox`}
                      type="checkbox"
                      checked={item.acceptWithoutAccent}
                      onChange={(e) => updateItem(index, { acceptWithoutAccent: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <span className="text-muted-foreground">Aceitar resposta sem acento</span>
                  </label>
                </div>
              )}

              {item.kind === 'MATCH_CLICK' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(['left', 'right'] as const).map((column) => (
                      <fieldset key={column} className="space-y-2">
                        <legend className="text-sm text-muted-foreground mb-1">
                          {column === 'left' ? 'Coluna A (idioma de apoio)' : 'Coluna B (PT)'}
                        </legend>
                        {item[column].map((entry, entryIndex) => (
                          <input
                            key={entry.id}
                            data-testid={`form-exercise-item-${index + 1}-${column}-${entryIndex + 1}-input`}
                            type="text"
                            value={entry.text}
                            onChange={(e) =>
                              updateItem(index, {
                                [column]: item[column].map((en, i) =>
                                  i === entryIndex ? { ...en, text: e.target.value } : en,
                                ),
                              } as Partial<ExerciseItemForm>)
                            }
                            placeholder={`Entrada ${entryIndex + 1}`}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2"
                          />
                        ))}
                        <div className="flex gap-2">
                          {item[column].length < MAX_MATCH_PAIRS && (
                            <button
                              data-testid={`form-exercise-item-${index + 1}-${column}-add-button`}
                              type="button"
                              onClick={() =>
                                updateItem(index, {
                                  [column]: [
                                    ...item[column],
                                    { id: newEntryId(column === 'left' ? 'e' : 'd'), text: '' },
                                  ],
                                } as Partial<ExerciseItemForm>)
                              }
                              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs"
                            >
                              <Plus className="h-3 w-3" />
                              Adicionar
                            </button>
                          )}
                          {item[column].length > MIN_MATCH_PAIRS && (
                            <button
                              data-testid={`form-exercise-item-${index + 1}-${column}-remove-button`}
                              type="button"
                              onClick={() =>
                                updateItem(index, {
                                  [column]: item[column].slice(0, -1),
                                } as Partial<ExerciseItemForm>)
                              }
                              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs"
                            >
                              Remover ultima
                            </button>
                          )}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="text-sm text-muted-foreground mb-1">
                      Pares corretos (equivalencia 1:1)
                    </legend>
                    {item.pairs.map((pair, pairIndex) => (
                      <div key={pairIndex} className="flex items-center gap-2">
                        <select
                          data-testid={`form-exercise-item-${index + 1}-pair-${pairIndex + 1}-left-select`}
                          value={pair.leftId}
                          onChange={(e) =>
                            updateItem(index, {
                              pairs: item.pairs.map((p, i) =>
                                i === pairIndex ? { ...p, leftId: e.target.value } : p,
                              ),
                            })
                          }
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Coluna A…</option>
                          {item.left.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.text || entry.id}
                            </option>
                          ))}
                        </select>
                        <span className="text-muted-foreground text-sm">liga com</span>
                        <select
                          data-testid={`form-exercise-item-${index + 1}-pair-${pairIndex + 1}-right-select`}
                          value={pair.rightId}
                          onChange={(e) =>
                            updateItem(index, {
                              pairs: item.pairs.map((p, i) =>
                                i === pairIndex ? { ...p, rightId: e.target.value } : p,
                              ),
                            })
                          }
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Coluna B…</option>
                          {item.right.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.text || entry.id}
                            </option>
                          ))}
                        </select>
                        <button
                          data-testid={`form-exercise-item-${index + 1}-pair-${pairIndex + 1}-delete-button`}
                          type="button"
                          onClick={() =>
                            updateItem(index, { pairs: item.pairs.filter((_, i) => i !== pairIndex) })
                          }
                          aria-label={`Excluir par ${pairIndex + 1}`}
                          className="inline-flex items-center rounded-lg border border-destructive text-destructive p-2 text-sm"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      data-testid={`form-exercise-item-${index + 1}-add-pair-button`}
                      type="button"
                      onClick={() =>
                        updateItem(index, { pairs: [...item.pairs, { leftId: '', rightId: '' }] })
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar par
                    </button>
                  </fieldset>
                </div>
              )}
            </div>
          ))}
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* Aba 3 — Revisao (ponto de ancoragem do preview jogavel, item 014) */}
        {/* ------------------------------------------------------------- */}
        <TabsContent data-testid="admin-exercise-editor-review" value="review" className="mt-4 space-y-4">
          <div
            data-testid="admin-exercise-editor-readiness"
            className="bg-card border border-border rounded-2xl p-4 space-y-2"
          >
            <h2 className="text-sm font-medium text-foreground">Prontidao para publicar</h2>
            <ul className="space-y-1">
              {readiness.checks.map((check) => (
                <li key={check.label} className="flex items-start gap-2 text-sm">
                  {check.ok ? (
                    <CircleCheck className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  ) : (
                    <CircleAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <span className={check.ok ? 'text-foreground' : 'text-destructive'}>
                    {check.label}
                  </span>
                </li>
              ))}
            </ul>
            {readiness.itemErrors.length > 0 && (
              <ul data-testid="admin-exercise-editor-review-item-errors" className="space-y-1 pt-2 border-t border-border">
                {readiness.itemErrors.map((message) => (
                  <li key={message} className="flex items-start gap-2 text-sm text-destructive">
                    <CircleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            data-testid="admin-exercise-editor-review-items"
            className="bg-card border border-border rounded-2xl p-4 space-y-2"
          >
            <h2 className="text-sm font-medium text-foreground">
              Itens ({form.items.length})
            </h2>
            {form.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item ainda.</p>
            ) : (
              <ol className="space-y-1">
                {form.items.map((item, index) => (
                  <li
                    key={item.id ?? `new-${index}`}
                    data-testid={`admin-exercise-editor-review-item-${index + 1}`}
                    className="text-sm text-muted-foreground"
                  >
                    <span className="text-foreground font-medium">{index + 1}.</span>{' '}
                    {t(KIND_MESSAGE_KEY[item.kind] as never)}
                    {item.prompt ? ` — ${item.prompt}` : ''}
                    {item.kind === 'VERB_CLOZE' && item.sentence ? ` — ${item.sentence}` : ''}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Preview jogavel do professor (item 014) */}
          <div className="flex justify-end">
            <button
              data-testid="admin-exercise-editor-start-preview-button"
              type="button"
              disabled={form.items.length === 0 || readiness.itemErrors.length > 0}
              onClick={() => setShowPreview(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-primary text-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Jogar preview
            </button>
          </div>

          <Dialog open={showPreview} onOpenChange={setShowPreview}>
            <DialogContent showCloseButton={false} className="max-w-2xl p-0">
              <DialogTitle className="sr-only">Preview</DialogTitle>
              <ExercisePreview
                items={form.items}
                onClose={() => setShowPreview(false)}
              />
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {/* Acoes — um unico submit; salvar e publicar sao acoes separadas como no ContentEditor. */}
      <div data-testid="admin-exercise-editor-actions" className="flex flex-wrap gap-2">
        <button
          data-testid="admin-exercise-editor-save-button"
          type="button"
          disabled={saving}
          onClick={saveDraft}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
        >
          {saving ? (
            <Loader2 data-testid="admin-exercise-editor-loading" className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar rascunho
        </button>
        <button
          data-testid="admin-exercise-editor-publish-button"
          type="button"
          disabled={saving || !canPublish}
          onClick={publish}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          Publicar
        </button>
        {form.id && (
          <button
            data-testid="admin-exercise-editor-archive-button"
            type="button"
            disabled={saving || form.status === 'ARCHIVED'}
            onClick={archive}
            className="inline-flex items-center gap-2 rounded-lg border border-destructive text-destructive px-4 py-2 text-sm ml-auto disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Arquivar
          </button>
        )}
      </div>
    </div>
  );
}
