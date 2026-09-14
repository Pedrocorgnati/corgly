import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageWrapper } from '@/components/shared';
import { ErrorState } from '@/components/ui/error-state';
import { ExerciseEditor } from '@/components/admin/exercise-editor';
import type { ExerciseEditorInitial, ExerciseItemForm } from '@/components/admin/exercise-editor';
import { getAdminExercise } from '@/actions/admin-exercises';
import {
  EXERCISE_ITEM_SCHEMAS_BY_KIND,
  PHASE_1_EXERCISE_ITEM_KINDS,
  type Phase1ExerciseItemKind,
} from '@/lib/exercises';

export const metadata: Metadata = {
  title: 'Admin — Editar exercício',
};

type Locale = 'PT_BR' | 'EN_US' | 'ES_ES' | 'IT_IT';

const EMPTY_TRANSLATION = (locale: Locale) => ({ locale, title: '', summary: '' });

/**
 * Mapeia o detalhe do banco para o modelo de formulario do editor.
 *
 * `payload`/`answerKey` chegam como `unknown` (colunas Json); o parse por kind
 * usa os mesmos schemas Zod da escrita (item 002), entao um item corrompido
 * falha alto aqui em vez de renderizar formulario silenciosamente truncado.
 * Kind fora da Fase 1 tambem falha alto: a Fase 1 so escreve os quatro.
 */
function mapItem(raw: {
  id: string;
  kind: string;
  payload: unknown;
  answerKey: unknown;
  acceptWithoutAccent: boolean;
}): ExerciseItemForm {
  if (!(PHASE_1_EXERCISE_ITEM_KINDS as readonly string[]).includes(raw.kind)) {
    throw new Error(`Item ${raw.id} tem kind ${raw.kind}, fora da Fase 1.`);
  }

  const kind = raw.kind as Phase1ExerciseItemKind;
  const base: ExerciseItemForm = {
    id: raw.id,
    kind,
    acceptWithoutAccent: raw.acceptWithoutAccent,
    prompt: '',
    options: [],
    correctIndex: -1,
    readingText: '',
    infinitive: '',
    tense: '',
    person: '',
    sentence: '',
    canonical: '',
    acceptedText: '',
    left: [],
    right: [],
    pairs: [],
  };

  if (kind === 'MULTIPLE_CHOICE') {
    const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.MULTIPLE_CHOICE.payload.parse(raw.payload);
    const answerKey = EXERCISE_ITEM_SCHEMAS_BY_KIND.MULTIPLE_CHOICE.answerKey.parse(raw.answerKey);
    return { ...base, prompt: payload.prompt, options: [...payload.options], correctIndex: answerKey.correctIndex };
  }

  if (kind === 'TEXT_CHOICE') {
    const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.TEXT_CHOICE.payload.parse(raw.payload);
    const answerKey = EXERCISE_ITEM_SCHEMAS_BY_KIND.TEXT_CHOICE.answerKey.parse(raw.answerKey);
    return {
      ...base,
      readingText: payload.readingText,
      prompt: payload.prompt,
      options: [...payload.options],
      correctIndex: answerKey.correctIndex,
    };
  }

  if (kind === 'VERB_CLOZE') {
    const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.VERB_CLOZE.payload.parse(raw.payload);
    const answerKey = EXERCISE_ITEM_SCHEMAS_BY_KIND.VERB_CLOZE.answerKey.parse(raw.answerKey);
    return {
      ...base,
      infinitive: payload.infinitive,
      tense: payload.tense,
      person: payload.person,
      sentence: payload.sentence,
      canonical: answerKey.canonical,
      acceptedText: answerKey.accepted.join('\n'),
    };
  }

  const payload = EXERCISE_ITEM_SCHEMAS_BY_KIND.MATCH_CLICK.payload.parse(raw.payload);
  const answerKey = EXERCISE_ITEM_SCHEMAS_BY_KIND.MATCH_CLICK.answerKey.parse(raw.answerKey);
  return {
    ...base,
    left: payload.left.map((entry) => ({ ...entry })),
    right: payload.right.map((entry) => ({ ...entry })),
    pairs: answerKey.pairs.map((pair) => ({ ...pair })),
  };
}

interface EditExercisePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; preview?: string }>;
}

export default async function EditExercisePage({ params, searchParams }: EditExercisePageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { data, error } = await getAdminExercise(id);

  if (!data) {
    if (error === 'Unauthorized') notFound();
    return (
      <PageWrapper data-testid="page-admin-exercise-detail">
        <div className="bg-card border border-border rounded-2xl shadow-sm">
          <ErrorState
            data-testid="admin-exercise-detail-error"
            title="Erro ao carregar exercício"
            message={error ?? 'Erro desconhecido.'}
          />
        </div>
      </PageWrapper>
    );
  }

  let items: ExerciseItemForm[];
  try {
    items = data.items.map(mapItem);
  } catch (err) {
    return (
      <PageWrapper data-testid="page-admin-exercise-detail">
        <div className="bg-card border border-border rounded-2xl shadow-sm">
          <ErrorState
            data-testid="admin-exercise-detail-invalid"
            title="Exercício com dados fora do contrato da Fase 1"
            message={err instanceof Error ? err.message : 'Conteúdo inválido.'}
          />
        </div>
      </PageWrapper>
    );
  }

  const translations = {
    PT_BR: EMPTY_TRANSLATION('PT_BR'),
    EN_US: EMPTY_TRANSLATION('EN_US'),
    ES_ES: EMPTY_TRANSLATION('ES_ES'),
    IT_IT: EMPTY_TRANSLATION('IT_IT'),
  };
  for (const translation of data.translations) {
    if (translation.locale in translations) {
      translations[translation.locale as Locale] = {
        locale: translation.locale as Locale,
        title: translation.title,
        summary: translation.summary ?? '',
      };
    }
  }

  const initial: ExerciseEditorInitial = {
    id: data.id,
    internalTitle: data.internalTitle,
    supportLanguage: data.supportLanguage as Locale,
    level: data.level,
    subject: data.subject,
    tags: data.tags ?? [],
    timeEstimateMin: data.timeEstimateMin,
    status: data.status,
    translations,
    items,
  };

  return (
    <PageWrapper data-testid="page-admin-exercise-detail">
      <div data-testid="admin-exercise-detail-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Editar — {data.internalTitle}</h1>
      </div>
      <ExerciseEditor
        initial={initial}
        initialTab={query.tab === 'review' ? 'review' : 'metadata'}
        initialPreviewOpen={query.tab === 'review' && query.preview === '1'}
      />
    </PageWrapper>
  );
}
