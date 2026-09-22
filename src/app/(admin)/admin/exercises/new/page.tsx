import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageWrapper } from '@/components/shared';
import { ExerciseEditor } from '@/components/admin/exercise-editor';
import { ROUTES } from '@/lib/constants/routes';

export const metadata: Metadata = {
  title: 'Admin — Novo exercício',
};

export default function NewExercisePage() {
  return (
    <PageWrapper data-testid="page-admin-exercise-new">
      <div
        data-testid="admin-exercise-new-header"
        className="mb-6 flex items-center gap-3"
      >
        <Link
          href={ROUTES.ADMIN_EXERCISES}
          data-testid="admin-exercise-new-back-button"
          className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Novo exercício</h1>
      </div>
      <ExerciseEditor />
    </PageWrapper>
  );
}
