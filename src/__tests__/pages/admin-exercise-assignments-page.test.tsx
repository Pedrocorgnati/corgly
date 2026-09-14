import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAdminExercise: vi.fn(),
  getAdminExerciseAssignments: vi.fn(),
  getAdminStudents: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

vi.mock('@/actions/admin-exercises', () => ({
  getAdminExercise: mocks.getAdminExercise,
  getAdminExerciseAssignments: mocks.getAdminExerciseAssignments,
}));

vi.mock('@/actions/admin-students', () => ({
  getAdminStudents: mocks.getAdminStudents,
}));

vi.mock('@/components/shared', () => ({
  PageWrapper: ({
    children,
    ...props
  }: PropsWithChildren<{ 'data-testid'?: string }>) => (
    <main {...props}>{children}</main>
  ),
}));

vi.mock('@/components/ui/error-state', () => ({
  ErrorState: ({
    title,
    message,
    ...props
  }: {
    title: string;
    message: string;
    'data-testid'?: string;
  }) => (
    <div {...props}>
      <h2>{title}</h2>
      <p>{message}</p>
    </div>
  ),
}));

vi.mock('@/components/admin/exercises/assignment-list', () => ({
  AssignmentList: ({ activeCount }: { activeCount: number }) => (
    <div data-testid="assignment-active-count">{activeCount}</div>
  ),
}));

vi.mock('@/components/admin/exercises/student-toggle-list', () => ({
  StudentToggleList: ({
    exerciseId,
    assignmentByStudentId,
    search,
    page,
  }: {
    exerciseId: string;
    assignmentByStudentId: Map<string, { status: string }>;
    search: string;
    page: number;
  }) => (
    <div data-testid="student-toggle-list-probe">
      <span data-testid="probe-exercise-id">{exerciseId}</span>
      <span data-testid="probe-search">{search}</span>
      <span data-testid="probe-page">{page}</span>
      <span data-testid="probe-assignment-states">
        {Array.from(assignmentByStudentId.entries())
          .map(([studentId, assignment]) => `${studentId}:${assignment.status}`)
          .sort()
          .join(',')}
      </span>
    </div>
  ),
}));

import ExerciseAssignmentsPage from '@/app/(admin)/admin/exercises/[id]/assignments/page';

const publishedExercise = {
  id: 'exercise-1',
  internalTitle: 'Present perfect',
  status: 'PUBLISHED',
};

const studentsResponse = {
  items: [],
  total: 0,
  page: 1,
  limit: 20,
};

function assignment(studentId: string, status: 'ACTIVE' | 'REVOKED') {
  return {
    id: `assignment-${studentId}`,
    studentId,
    status,
    grantedAt: '2026-09-01T12:00:00.000Z',
    revokedAt: status === 'REVOKED' ? '2026-09-02T12:00:00.000Z' : null,
    firstSeenAt: null,
    student: {
      id: studentId,
      name: `Aluno ${studentId}`,
      email: `${studentId}@example.com`,
    },
  };
}

async function renderPage(searchParams: { search?: string; page?: string } = {}) {
  render(
    await ExerciseAssignmentsPage({
      params: Promise.resolve({ id: 'exercise-1' }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe('/admin/exercises/[id]/assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminExercise.mockResolvedValue({ data: publishedExercise, error: null });
    mocks.getAdminExerciseAssignments.mockResolvedValue({ data: [], error: null });
    mocks.getAdminStudents.mockResolvedValue({ data: studentsResponse, error: null });
  });

  it('entrega ACTIVE e REVOKED à UI e conta somente ACTIVE', async () => {
    mocks.getAdminExerciseAssignments.mockResolvedValue({
      data: [
        assignment('student-active', 'ACTIVE'),
        assignment('student-revoked', 'REVOKED'),
      ],
      error: null,
    });

    await renderPage();

    expect(screen.getByTestId('probe-assignment-states')).toHaveTextContent(
      'student-active:ACTIVE,student-revoked:REVOKED',
    );
    expect(screen.getByTestId('assignment-active-count')).toHaveTextContent('1');
  });

  it('pagina e busca chegam à listagem sem qualquer filtro de idioma', async () => {
    await renderPage({ search: 'Ana', page: '3' });

    expect(mocks.getAdminStudents).toHaveBeenCalledWith({
      search: 'Ana',
      page: 3,
      limit: expect.any(Number),
    });
    const filters = mocks.getAdminStudents.mock.calls[0]?.[0];
    expect(filters).not.toHaveProperty('preferredLanguage');
    expect(filters).not.toHaveProperty('supportLanguage');
    expect(screen.getByTestId('probe-search')).toHaveTextContent('Ana');
    expect(screen.getByTestId('probe-page')).toHaveTextContent('3');
  });

  it('falha ao listar assignments fica visível e não monta a lista com mapa vazio', async () => {
    mocks.getAdminExerciseAssignments.mockResolvedValue({
      data: null,
      error: 'Falha ao consultar liberações.',
    });

    await renderPage();

    expect(screen.getByTestId('exercise-assignments-students-error')).toHaveTextContent(
      'Falha ao consultar liberações.',
    );
    expect(screen.queryByTestId('student-toggle-list-probe')).not.toBeInTheDocument();
  });
});
