import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptBR from '../../../i18n/messages/pt-BR.json';

const mocks = vi.hoisted(() => ({
  getStudentExercises: vi.fn(),
  loggerError: vi.fn(),
  pathname: '/exercises',
}));

vi.mock('@/lib/exercises/actions', () => ({
  getStudentExercises: mocks.getStudentExercises,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@/components/shared', () => ({
  PageWrapper: ({ children, ...props }: PropsWithChildren<{ 'data-testid'?: string }>) => (
    <main {...props}>{children}</main>
  ),
}));

vi.mock('@/components/exercises', () => ({
  ExerciseCard: ({
    exerciseId,
    title,
    status,
  }: {
    exerciseId: string;
    title: string;
    status: string;
  }) => (
    <a
      href={`/exercises/${exerciseId}`}
      data-testid={`exercise-assignment-card-${exerciseId}`}
      data-status={status}
    >
      {title}
    </a>
  ),
}));

vi.mock('@/components/ui/loading-skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="shared-skeleton" className={className} />
  ),
  CardSkeleton: () => <div data-testid="shared-card-skeleton" />,
}));

import ExercisesPage from '@/app/(student)/exercises/page';
import ExercisesLoading from '@/app/(student)/exercises/loading';
import ExercisesError from '@/app/(student)/exercises/error';

const exercise = {
  id: 'exercise-1',
  exerciseId: 'exercise-1',
  title: 'Presente do indicativo',
  supportLanguage: 'PT_BR' as const,
  level: 1,
  subject: 'Gramática',
  itemCount: 5,
  predominantKind: 'MULTIPLE_CHOICE' as const,
  isNew: false,
  status: 'IN_PROGRESS' as const,
  progress: { answeredCount: 2, correctCount: 1, itemCount: 5 },
};

describe('/exercises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStudentExercises.mockResolvedValue([]);
  });

  it('renderiza sucesso na grade canônica, com testid único e cards pelo Exercise.id', async () => {
    mocks.getStudentExercises.mockResolvedValue([
      exercise,
      {
        ...exercise,
        id: 'exercise-2',
        exerciseId: 'exercise-2',
        title: 'Pretérito perfeito',
        status: 'COMPLETED',
      },
    ]);

    render(<>{await ExercisesPage()}</>);

    expect(mocks.getStudentExercises).toHaveBeenCalledOnce();
    expect(screen.getAllByTestId('page-exercises')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Navegação estrutural' })).toBeInTheDocument();

    const list = screen.getByTestId('exercise-assignments-list');
    expect(list).toHaveClass(
      'grid',
      'grid-cols-1',
      'gap-4',
      'sm:grid-cols-2',
      'lg:grid-cols-3',
    );
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId('exercise-assignment-card-exercise-1')).toHaveAttribute(
      'href',
      '/exercises/exercise-1',
    );
    expect(screen.getByTestId('exercise-assignment-card-exercise-2')).toHaveAttribute(
      'data-status',
      'COMPLETED',
    );
    expect(screen.queryByTestId('library-empty')).not.toBeInTheDocument();
  });

  it('renderiza o empty state canônico quando não há atribuições', async () => {
    render(<>{await ExercisesPage()}</>);

    const empty = screen.getByTestId('library-empty');
    expect(empty).toHaveTextContent('Nenhum exercício disponível ainda');
    expect(empty).toHaveTextContent(
      'Assim que um exercício for liberado para você, ele aparece aqui.',
    );
    expect(empty).toHaveClass('rounded-2xl', 'border-dashed', 'border-border', 'bg-card');
    expect(screen.queryByTestId('exercise-assignments-list')).not.toBeInTheDocument();
  });

  it('usa os skeletons compartilhados e espelha a grade durante o loading', () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <ExercisesLoading />
      </NextIntlClientProvider>,
    );

    const loading = screen.getByTestId('exercises-loading');
    expect(
      within(loading).getByRole('status', {
        busy: true,
        name: 'Carregando conteúdo',
      }),
    ).toHaveTextContent('Carregando...');
    expect(screen.getAllByTestId('shared-skeleton')).toHaveLength(4);
    expect(screen.getAllByTestId('shared-card-skeleton')).toHaveLength(3);

    const list = screen.getByTestId('exercise-assignments-loading-list');
    expect(list).toHaveClass(
      'grid',
      'grid-cols-1',
      'gap-4',
      'sm:grid-cols-2',
      'lg:grid-cols-3',
    );
    for (const item of within(list).getAllByRole('listitem')) {
      expect(item).toHaveClass('h-full', 'min-h-48');
    }
  });

  it('traduz o erro e aciona exatamente unstable_retry pelo alvo de 44 px', () => {
    const unstableRetry = vi.fn();

    render(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <ExercisesError error={Object.assign(new Error('database'), { digest: 'digest-1' })} unstable_retry={unstableRetry} />
      </NextIntlClientProvider>,
    );

    const errorState = screen.getByTestId('exercises-error');
    expect(errorState).toHaveTextContent('Erro ao carregar os exercícios');
    expect(errorState).toHaveTextContent(
      'Não foi possível montar o exercício desta aula. Tente novamente.',
    );

    const retry = screen.getByTestId('exercises-error-retry-button');
    expect(retry).toHaveClass('min-h-11', 'min-w-11');
    fireEvent.click(retry);
    expect(unstableRetry).toHaveBeenCalledOnce();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Route error boundary triggered',
      { route: '/exercises', digest: 'digest-1' },
      expect.any(Error),
    );
  });
});
