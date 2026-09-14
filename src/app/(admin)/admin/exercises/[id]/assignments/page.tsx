import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminExercise, getAdminExerciseAssignments } from '@/actions/admin-exercises';
import { getAdminStudents } from '@/actions/admin-students';
import { ErrorState } from '@/components/ui/error-state';
import { PageWrapper } from '@/components/shared';
import { AssignmentList } from '@/components/admin/exercises/assignment-list';
import { StudentToggleList } from '@/components/admin/exercises/student-toggle-list';
import { PAGINATION } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Admin — Liberações de Exercício',
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function ExerciseAssignmentsPage(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const exerciseId = params.id;

  // Buscar exercício
  const { data: exercise, error: exerciseError } = await getAdminExercise(exerciseId);

  if (exerciseError || !exercise) {
    if (exerciseError === 'Unauthorized') {
      return (
        <PageWrapper data-testid="page-exercise-assignments-unauthorized">
          <ErrorState
            title="Acesso negado"
            message="Você não tem permissão para acessar esta página."
          />
        </PageWrapper>
      );
    }
    notFound();
  }

  // Exercício não publicado não pode ter liberações
  if (exercise.status !== 'PUBLISHED') {
    return (
      <PageWrapper data-testid="page-exercise-assignments-not-published">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            Liberações — {exercise.internalTitle}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Este exercício ainda não foi publicado. Publique-o primeiro para gerenciar liberações.
          </p>
        </div>
      </PageWrapper>
    );
  }

  // Buscar assignments e alunos em paralelo
  const search = searchParams.search ?? '';
  const page = Math.max(1, Number(searchParams.page) || 1);

  const [assignmentsResult, studentsResult] = await Promise.all([
    getAdminExerciseAssignments(exerciseId),
    getAdminStudents({
      search: search || undefined,
      page,
      limit: PAGINATION.ADMIN_STUDENTS,
    }),
  ]);

  const assignments = assignmentsResult.data ?? [];
  const assignmentsError = assignmentsResult.error;
  const students = studentsResult.data;
  const studentsError = studentsResult.error;

  // ACTIVE e REVOKED precisam chegar a UI. REVOKED nao equivale a ausencia:
  // liberar novamente reativa o mesmo vinculo pelo upsert do dominio.
  const assignmentByStudentId = new Map(
    assignments.map((assignment) => [assignment.studentId, assignment]),
  );

  const activeCount = assignments.filter((a) => a.status === 'ACTIVE').length;

  return (
    <PageWrapper data-testid="page-exercise-assignments">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel esquerdo: info do exercício */}
        <div className="lg:col-span-1">
          <AssignmentList
            exercise={exercise}
            activeCount={activeCount}
          />
        </div>

        {/* Painel direito: lista de alunos */}
        <div className="lg:col-span-2">
          {assignmentsError || studentsError ? (
            <ErrorState
              data-testid="exercise-assignments-students-error"
              title="Erro ao carregar liberações"
              message={assignmentsError ?? studentsError ?? 'Tente novamente.'}
            />
          ) : students ? (
            <StudentToggleList
              exerciseId={exerciseId}
              students={students}
              assignmentByStudentId={assignmentByStudentId}
              search={search}
              page={page}
            />
          ) : null}
        </div>
      </div>
    </PageWrapper>
  );
}
