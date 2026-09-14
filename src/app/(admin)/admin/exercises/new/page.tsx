import type { Metadata } from 'next';
import { PageWrapper } from '@/components/shared';
import { ExerciseEditor } from '@/components/admin/exercise-editor';

export const metadata: Metadata = {
  title: 'Admin — Novo exercício',
};

export default function NewExercisePage() {
  return (
    <PageWrapper data-testid="page-admin-exercise-new">
      <div data-testid="admin-exercise-new-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Novo exercício</h1>
      </div>
      <ExerciseEditor />
    </PageWrapper>
  );
}
