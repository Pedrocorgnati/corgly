import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Dumbbell } from 'lucide-react';
import { PAGINATION } from '@/lib/constants';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { Badge } from '@/components/ui/badge';
import { ExerciseSearchInput } from '@/components/admin/ExerciseSearchInput';
import { ExerciseRowActions } from '@/components/admin/exercises/exercise-row-actions';
import { getAdminExercises, type AdminExerciseFilters } from '@/actions/admin-exercises';
import { ROUTES } from '@/lib/constants/routes';
import {
  EXERCISE_STATUS_MAP,
  type ExerciseItemKind,
  type SupportedLanguage,
} from '@/lib/constants/enums';
import { formatDatePtBR } from '@/lib/format-datetime';
import { PageWrapper } from '@/components/shared';

export const metadata: Metadata = {
  title: 'Admin — Exercícios',
};

type SearchParamValue = string | string[] | undefined;

interface AdminExerciseSearchParams {
  search?: SearchParamValue;
  level?: SearchParamValue;
  subject?: SearchParamValue;
  supportLanguage?: SearchParamValue;
  status?: SearchParamValue;
  tag?: SearchParamValue;
  page?: SearchParamValue;
}

interface Props {
  searchParams: Promise<AdminExerciseSearchParams>;
}

interface ActiveFilters {
  search: string;
  level: string;
  subject: string;
  supportLanguage: string;
  status: string;
  tag: string;
}

const SUPPORT_LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  PT_BR: 'Português (Brasil)',
  EN_US: 'Inglês (Estados Unidos)',
  ES_ES: 'Espanhol (Espanha)',
  IT_IT: 'Italiano (Itália)',
};

const ITEM_KIND_LABELS: Record<ExerciseItemKind, string> = {
  MULTIPLE_CHOICE: 'Múltipla escolha',
  MATCH_CLICK: 'Ligar pares',
  AUDIO_WORD: 'Áudio e palavra',
  AUDIO_CLOZE: 'Áudio e lacuna',
  AUDIO_SENTENCE: 'Áudio e frase',
  AUDIO_CHOICE: 'Áudio e escolha',
  AUDIO_ORDER: 'Ordenar por áudio',
  TEXT_CHOICE: 'Leitura e escolha',
  VERB_CLOZE: 'Conjugação na frase',
  IMAGE_WORD: 'Imagem e palavra',
  IMAGE_CHOICE: 'Imagem e escolha',
  IMAGE_SPEAK: 'Fala com imagem',
  AUDIO_SHADOW: 'Repetição de áudio',
  L1_SPEAK_PT: 'Fala guiada em português',
};

const tableHeaderClass =
  'whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-muted-foreground';
const tableCellClass = 'px-4 py-3 text-sm text-foreground align-top';

function scalarParam(value: SearchParamValue): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function filtersFromParams(params: AdminExerciseSearchParams): ActiveFilters {
  return {
    search: scalarParam(params.search),
    level: scalarParam(params.level),
    subject: scalarParam(params.subject),
    supportLanguage: scalarParam(params.supportLanguage),
    status: scalarParam(params.status),
    tag: scalarParam(params.tag),
  };
}

function filtersForAction(
  filters: ActiveFilters,
  page: string | number,
): AdminExerciseFilters {
  return {
    search: filters.search || undefined,
    level: filters.level || undefined,
    subject: filters.subject || undefined,
    supportLanguage: filters.supportLanguage || undefined,
    status: filters.status || undefined,
    tag: filters.tag || undefined,
    page,
    limit: PAGINATION.ADMIN_EXERCISES,
  };
}

function pageHref(filters: ActiveFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.level) params.set('level', filters.level);
  if (filters.subject) params.set('subject', filters.subject);
  if (filters.supportLanguage) params.set('supportLanguage', filters.supportLanguage);
  if (filters.status) params.set('status', filters.status);
  if (filters.tag) params.set('tag', filters.tag);
  params.set('page', String(page));
  return `${ROUTES.ADMIN_EXERCISES}?${params.toString()}`;
}

function ExerciseFilters({ filters }: { filters: ActiveFilters }) {
  const inputClass =
    'min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground';

  return (
    <form
      action={ROUTES.ADMIN_EXERCISES}
      method="get"
      className="mb-5 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
      data-testid="admin-exercises-filters"
    >
      {filters.search && <input type="hidden" name="search" value={filters.search} />}

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Nível
        <input
          className={inputClass}
          type="number"
          name="level"
          min={0}
          max={100}
          defaultValue={filters.level}
          placeholder="Todos"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Matéria
        <input
          className={inputClass}
          type="text"
          name="subject"
          maxLength={80}
          defaultValue={filters.subject}
          placeholder="Todas"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Idioma
        <select
          className={inputClass}
          name="supportLanguage"
          defaultValue={filters.supportLanguage}
        >
          <option value="">Todos</option>
          {Object.entries(SUPPORT_LANGUAGE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Status
        <select className={inputClass} name="status" defaultValue={filters.status}>
          <option value="">Todos</option>
          <option value="DRAFT">Rascunho</option>
          <option value="PUBLISHED">Publicado</option>
          <option value="ARCHIVED">Arquivado</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Tag
        <input
          className={inputClass}
          type="text"
          name="tag"
          maxLength={60}
          defaultValue={filters.tag}
          placeholder="Todas"
        />
      </label>

      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
        <button
          type="submit"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Aplicar filtros
        </button>
        <Link
          href={ROUTES.ADMIN_EXERCISES}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground"
        >
          Limpar filtros
        </Link>
      </div>
    </form>
  );
}

export async function ExercisesTable({ searchParams }: Props) {
  const params = await searchParams;
  const filters = filtersFromParams(params);
  const rawPage = scalarParam(params.page) || 1;
  const { data, error } = await getAdminExercises(filtersForAction(filters, rawPage));
  const hasActiveFilters = Object.values(filters).some(Boolean);

  if (error) {
    return (
      <>
        <ExerciseFilters filters={filters} />
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <ErrorState
            data-testid="admin-exercises-error"
            title="Erro ao carregar exercícios"
            message={error}
          />
        </div>
      </>
    );
  }

  if (!data || data.items.length === 0) {
    const hasStoredExercises = (data?.total ?? 0) > 0;
    const isPageOutOfRange = hasStoredExercises && Number(rawPage) > 1;
    const isFilteredEmpty = hasActiveFilters && !isPageOutOfRange;

    return (
      <>
        <ExerciseFilters filters={filters} />
        <EmptyState
          data-testid={
            isFilteredEmpty
              ? 'admin-exercises-filtered-empty'
              : isPageOutOfRange
                ? 'admin-exercises-page-empty'
                : 'admin-exercises-empty'
          }
          icon={Dumbbell}
          title={
            isFilteredEmpty
              ? 'Nenhum exercício encontrado'
              : isPageOutOfRange
                ? 'Nenhum exercício nesta página'
                : 'Nenhum exercício ainda'
          }
          description={
            isFilteredEmpty
              ? 'Nenhum exercício corresponde à busca e aos filtros selecionados.'
              : isPageOutOfRange
                ? 'A página solicitada não contém resultados. Volte à primeira página.'
              : 'Os exercícios da biblioteca aparecerão aqui.'
          }
          actionLabel={
            isFilteredEmpty
              ? 'Limpar filtros'
              : isPageOutOfRange
                ? 'Voltar à primeira página'
                : undefined
          }
          actionHref={
            isFilteredEmpty
              ? ROUTES.ADMIN_EXERCISES
              : isPageOutOfRange
                ? pageHref(filters, 1)
                : undefined
          }
        />
      </>
    );
  }

  const page = data.page;
  const totalPages = Math.ceil(data.total / data.limit);

  return (
    <>
      <ExerciseFilters filters={filters} />
      <p className="mb-4 text-sm text-muted-foreground">
        {data.total} exercício(s) na biblioteca
      </p>

      <div
        data-testid="admin-exercises-table"
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className={tableHeaderClass}>Título interno</th>
                <th className={tableHeaderClass}>Título do aluno</th>
                <th className={tableHeaderClass}>Tipo predominante</th>
                <th className={tableHeaderClass}>Idioma de apoio</th>
                <th className={tableHeaderClass}>Nível</th>
                <th className={tableHeaderClass}>Matéria</th>
                <th className={tableHeaderClass}>Tags</th>
                <th className={tableHeaderClass}>Itens</th>
                <th className={tableHeaderClass}>Status</th>
                <th className={tableHeaderClass}>Alunos ativos</th>
                <th className={tableHeaderClass}>Última edição</th>
                <th className={`${tableHeaderClass} text-right`}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((exercise) => {
                const statusConfig = EXERCISE_STATUS_MAP[exercise.status];
                return (
                  <tr
                    key={exercise.id}
                    data-testid={`admin-exercises-row-${exercise.id}`}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/20"
                  >
                    <td className={`${tableCellClass} font-medium`}>{exercise.internalTitle}</td>
                    <td className={tableCellClass}>
                      {exercise.studentTitle ?? (
                        <span className="text-muted-foreground">Sem título no idioma de apoio</span>
                      )}
                    </td>
                    <td className={tableCellClass}>
                      {exercise.predominantKind ? (
                        ITEM_KIND_LABELS[exercise.predominantKind]
                      ) : (
                        <span className="text-muted-foreground">Sem tipo</span>
                      )}
                    </td>
                    <td className={tableCellClass}>
                      {SUPPORT_LANGUAGE_LABELS[exercise.supportLanguage]}
                    </td>
                    <td className={tableCellClass}>Nível {exercise.level}</td>
                    <td className={tableCellClass}>
                      {exercise.subject ?? <span className="text-muted-foreground">Sem matéria</span>}
                    </td>
                    <td className={tableCellClass}>
                      {exercise.tags.length > 0 ? (
                        <ul
                          className="flex min-w-40 flex-wrap gap-1"
                          aria-label={`Tags de ${exercise.internalTitle}`}
                        >
                          {exercise.tags.map((tag) => (
                            <li key={tag}>
                              <Badge variant="secondary">{tag}</Badge>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground">Sem tags</span>
                      )}
                    </td>
                    <td className={tableCellClass}>{exercise.itemCount}</td>
                    <td className={tableCellClass}>
                      <Badge
                        variant="outline"
                        className={`${statusConfig.color} ${statusConfig.bg} ${statusConfig.border}`}
                      >
                        {statusConfig.label}
                      </Badge>
                    </td>
                    <td className={tableCellClass}>{exercise.activeAssignmentCount}</td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatDatePtBR(exercise.updatedAt)}
                    </td>
                    <td className={`${tableCellClass} text-right`}>
                      <ExerciseRowActions
                        exerciseId={exercise.id}
                        internalTitle={exercise.internalTitle}
                        status={exercise.status}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Paginação de exercícios"
          data-testid="admin-exercises-pagination"
          className="mt-4 flex items-center justify-between"
        >
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(filters, page - 1)}
                data-testid="admin-exercises-pagination-prev-button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-muted"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(filters, page + 1)}
                data-testid="admin-exercises-pagination-next-button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-muted"
              >
                Próxima
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}

export function AdminExercisesLoading() {
  return (
    <div
      data-testid="admin-exercises-loading"
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      aria-busy="true"
    >
      <TableSkeleton rows={5} />
    </div>
  );
}

export default async function AdminExercisesPage(props: Props) {
  return (
    <PageWrapper data-testid="page-admin-exercises">
      <div
        data-testid="admin-exercises-header"
        className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <h1 className="text-2xl font-bold text-foreground">Exercícios</h1>
        <div className="flex items-center gap-2">
          <Suspense fallback={<div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />}>
            <ExerciseSearchInput />
          </Suspense>
          <Link
            href={`${ROUTES.ADMIN_EXERCISES}/new`}
            data-testid="admin-exercises-new-button"
            className="inline-flex min-h-11 min-w-11 items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 text-sm text-primary-foreground"
          >
            Novo exercício
          </Link>
        </div>
      </div>

      <Suspense fallback={<AdminExercisesLoading />}>
        <ExercisesTable searchParams={props.searchParams} />
      </Suspense>
    </PageWrapper>
  );
}
