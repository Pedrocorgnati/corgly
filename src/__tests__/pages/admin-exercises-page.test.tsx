import { render, screen, within } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  archiveAdminExercise: vi.fn(),
  getAdminExercise: vi.fn(),
  getAdminExercises: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  refresh: vi.fn(),
}));

vi.mock('@/actions/admin-exercises', () => ({
  archiveAdminExercise: mocks.archiveAdminExercise,
  getAdminExercise: mocks.getAdminExercise,
  getAdminExercises: mocks.getAdminExercises,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/components/admin/ExerciseSearchInput', () => ({
  ExerciseSearchInput: () => <input aria-label="Buscar exercícios" />,
}));

vi.mock('@/components/shared', () => ({
  PageWrapper: ({ children, ...props }: PropsWithChildren<{ 'data-testid'?: string }>) => (
    <main {...props}>{children}</main>
  ),
}));

vi.mock('@/components/ui/loading-skeleton', () => ({
  TableSkeleton: () => <div data-testid="table-skeleton" />,
}));

vi.mock('@/components/ui/confirm-modal', () => ({
  ConfirmModal: () => null,
}));

vi.mock('@/components/admin/exercise-editor', () => ({
  ExerciseEditor: ({
    initialTab,
    initialPreviewOpen,
  }: {
    initialTab?: string;
    initialPreviewOpen?: boolean;
  }) => (
    <div
      data-testid="exercise-editor-probe"
      data-initial-tab={initialTab}
      data-preview-open={String(initialPreviewOpen)}
    />
  ),
}));

import {
  AdminExercisesLoading,
  ExercisesTable,
} from '@/app/(admin)/admin/exercises/page';
import EditExercisePage from '@/app/(admin)/admin/exercises/[id]/page';
import type { AdminExercise } from '@/actions/admin-exercises';

const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';

const exercise = {
  id: EXERCISE_ID,
  internalTitle: 'Passado composto',
  studentTitle: 'Present perfect',
  predominantKind: 'TEXT_CHOICE' as const,
  supportLanguage: 'EN_US' as const,
  level: 2,
  subject: 'Gramática',
  tags: ['A2', 'verbos'],
  itemCount: 3,
  status: 'PUBLISHED' as const,
  activeAssignmentCount: 4,
  updatedAt: '2026-09-08T12:00:00.000Z',
} satisfies AdminExercise;

function response(
  items: AdminExercise[] = [exercise],
  extra: Partial<{ total: number; page: number; limit: number }> = {},
) {
  return {
    data: {
      items,
      total: extra.total ?? items.length,
      page: extra.page ?? 1,
      limit: extra.limit ?? 20,
    },
    error: null,
  };
}

async function renderTable(searchParams: Record<string, string> = {}) {
  render(<>{await ExercisesTable({ searchParams: Promise.resolve(searchParams) })}</>);
}

describe('/admin/exercises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminExercises.mockResolvedValue(response());
    mocks.archiveAdminExercise.mockResolvedValue({
      data: { id: EXERCISE_ID, status: 'ARCHIVED' },
      error: null,
    });
  });

  it('renderiza exatamente 7 colunas e distingue os 6 dados das ações', async () => {
    await renderTable();

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Título interno',
      'Tipo predominante',
      'Matéria',
      'Tags',
      'Alunos ativos',
      'Status',
      'Ações',
    ]);

    const row = within(screen.getByTestId(`admin-exercises-row-${EXERCISE_ID}`));
    expect(row.getByText('Passado composto')).toBeInTheDocument();
    expect(row.getByText('Leitura e escolha')).toBeInTheDocument();
    expect(row.getByText('Gramática')).toBeInTheDocument();
    expect(row.getByText('A2')).toBeInTheDocument();
    expect(row.getByText('verbos')).toBeInTheDocument();
    expect(row.getByText('4')).toBeInTheDocument();

    const statusBadge = row.getByTestId(`admin-exercises-status-${EXERCISE_ID}`);
    expect(statusBadge).toHaveAttribute('title', 'Publicado');
    expect(statusBadge).toHaveAttribute('aria-label', 'Publicado');

    expect(screen.getByLabelText('Nível')).toBeInTheDocument();
    expect(screen.getByLabelText('Matéria')).toBeInTheDocument();
    expect(screen.getByLabelText('Idioma')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Tag')).toBeInTheDocument();

    expect(row.getByTestId(`exercise-row-edit-${EXERCISE_ID}`)).toHaveAttribute(
      'href',
      `/admin/exercises/${EXERCISE_ID}`,
    );
    expect(row.getByTestId(`exercise-row-assign-${EXERCISE_ID}`)).toHaveAttribute(
      'href',
      `/admin/exercises/${EXERCISE_ID}/assignments`,
    );
    expect(row.getByTestId(`exercise-row-preview-${EXERCISE_ID}`)).toHaveAttribute(
      'href',
      `/admin/exercises/${EXERCISE_ID}?tab=review&preview=1`,
    );
    expect(row.getByTestId(`exercise-row-archive-${EXERCISE_ID}`)).toBeEnabled();
    expect(row.queryByText(/duplicar/i)).not.toBeInTheDocument();
  });

  it('mostra fallbacks explícitos para todos os dados opcionais ausentes', async () => {
    mocks.getAdminExercises.mockResolvedValue(response([
      {
        ...exercise,
        predominantKind: null,
        subject: null,
        tags: [],
      },
    ]));

    await renderTable();

    expect(screen.getByText('Sem tipo')).toBeInTheDocument();
    expect(screen.getByText('Sem matéria')).toBeInTheDocument();
    expect(screen.getByText('Sem tags')).toBeInTheDocument();
  });

  it('combina busca e os cinco filtros antes de consultar a action', async () => {
    await renderTable({
      search: '  perfeito  ',
      level: '2',
      subject: 'Gramática',
      supportLanguage: 'EN_US',
      status: 'PUBLISHED',
      tag: 'A2',
      page: '3',
    });

    expect(mocks.getAdminExercises).toHaveBeenCalledWith({
      search: 'perfeito',
      level: '2',
      subject: 'Gramática',
      supportLanguage: 'EN_US',
      status: 'PUBLISHED',
      tag: 'A2',
      page: '3',
      limit: expect.any(Number),
    });
  });

  it('preserva busca e todos os filtros e altera somente page nos Links', async () => {
    mocks.getAdminExercises.mockResolvedValue(response([exercise], {
      total: 100,
      page: 2,
      limit: 20,
    }));

    const active = {
      search: 'verbo composto',
      level: '2',
      subject: 'Gramática',
      supportLanguage: 'EN_US',
      status: 'PUBLISHED',
      tag: 'A2',
      page: '2',
    };
    await renderTable(active);

    for (const [name, expectedPage] of [
      ['Anterior', '1'],
      ['Próxima', '3'],
    ] as const) {
      const href = screen.getByRole('link', { name }).getAttribute('href');
      const url = new URL(href ?? '', 'http://localhost');
      expect(url.pathname).toBe('/admin/exercises');
      expect(Object.fromEntries(url.searchParams)).toEqual({ ...active, page: expectedPage });
    }
  });

  it('distingue biblioteca vazia de resultado vazio por filtros', async () => {
    mocks.getAdminExercises.mockResolvedValue(response([]));
    await renderTable();

    expect(screen.getByTestId('admin-exercises-empty')).toHaveTextContent(
      'Nenhum exercício ainda',
    );
    expect(
      within(screen.getByTestId('admin-exercises-empty')).queryByRole('link'),
    ).not.toBeInTheDocument();

    document.body.replaceChildren();
    await renderTable({ status: 'ARCHIVED' });

    const filteredEmpty = screen.getByTestId('admin-exercises-filtered-empty');
    expect(filteredEmpty).toHaveTextContent('Nenhum exercício encontrado');
    expect(within(filteredEmpty).getByRole('link', { name: 'Limpar filtros' })).toHaveAttribute(
      'href',
      '/admin/exercises',
    );
  });

  it('não confunde página fora do intervalo com biblioteca sem cadastros', async () => {
    mocks.getAdminExercises.mockResolvedValue(response([], {
      total: 42,
      page: 999,
      limit: 20,
    }));

    await renderTable({ page: '999' });

    const empty = screen.getByTestId('admin-exercises-page-empty');
    expect(empty).toHaveTextContent('Nenhum exercício nesta página');
    expect(
      within(empty).getByRole('link', { name: 'Voltar à primeira página' }),
    ).toHaveAttribute('href', '/admin/exercises?page=1');
    expect(screen.queryByTestId('admin-exercises-empty')).not.toBeInTheDocument();
  });

  it('preserva filtros ao voltar da página fora do intervalo', async () => {
    mocks.getAdminExercises.mockResolvedValue(response([], {
      total: 3,
      page: 999,
      limit: 20,
    }));

    await renderTable({ search: 'verbo composto', status: 'PUBLISHED', page: '999' });

    const empty = screen.getByTestId('admin-exercises-page-empty');
    const href = within(empty)
      .getByRole('link', { name: 'Voltar à primeira página' })
      .getAttribute('href');
    const url = new URL(href ?? '', 'http://localhost');

    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: 'verbo composto',
      status: 'PUBLISHED',
      page: '1',
    });
    expect(screen.queryByTestId('admin-exercises-filtered-empty')).not.toBeInTheDocument();
  });

  it('mostra erro retornado pela action sem ocultar os filtros', async () => {
    mocks.getAdminExercises.mockResolvedValue({ data: null, error: 'API indisponível.' });

    await renderTable({ tag: 'A2' });

    expect(screen.getByTestId('admin-exercises-filters')).toBeInTheDocument();
    expect(screen.getByTestId('admin-exercises-error')).toHaveTextContent('API indisponível.');
  });

  it('preserva o fallback loading enquanto a tabela está suspensa', async () => {
    render(<AdminExercisesLoading />);

    expect(screen.getByTestId('admin-exercises-loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
  });
});

describe('/admin/exercises/[id] preview deep link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminExercise.mockResolvedValue({
      data: {
        id: EXERCISE_ID,
        internalTitle: 'Passado composto',
        supportLanguage: 'PT_BR',
        level: 2,
        subject: null,
        tags: [],
        timeEstimateMin: null,
        status: 'DRAFT',
        translations: [{ locale: 'PT_BR', title: 'Passado', summary: null }],
        items: [],
      },
      error: null,
    });
  });

  it('abre a aba Revisão e o preview existente quando recebe tab=review&preview=1', async () => {
    render(
      <>
        {await EditExercisePage({
          params: Promise.resolve({ id: EXERCISE_ID }),
          searchParams: Promise.resolve({ tab: 'review', preview: '1' }),
        })}
      </>,
    );

    expect(screen.getByTestId('exercise-editor-probe')).toHaveAttribute(
      'data-initial-tab',
      'review',
    );
    expect(screen.getByTestId('exercise-editor-probe')).toHaveAttribute(
      'data-preview-open',
      'true',
    );
  });

  it('mantém a edição normal fechada fora do deep link', async () => {
    render(
      <>
        {await EditExercisePage({
          params: Promise.resolve({ id: EXERCISE_ID }),
          searchParams: Promise.resolve({}),
        })}
      </>,
    );

    expect(screen.getByTestId('exercise-editor-probe')).toHaveAttribute(
      'data-initial-tab',
      'metadata',
    );
    expect(screen.getByTestId('exercise-editor-probe')).toHaveAttribute(
      'data-preview-open',
      'false',
    );
  });
});
