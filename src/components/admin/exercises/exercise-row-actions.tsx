'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { archiveAdminExercise, type AdminExercise } from '@/actions/admin-exercises';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { ROUTES } from '@/lib/constants/routes';

interface ExerciseRowActionsProps {
  exerciseId: string;
  internalTitle: string;
  status: AdminExercise['status'];
}

const actionLinkClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ExerciseRowActions({
  exerciseId,
  internalTitle,
  status,
}: ExerciseRowActionsProps) {
  const router = useRouter();
  const archiveInFlight = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [archivePending, setArchivePending] = useState(false);
  const editHref = `${ROUTES.ADMIN_EXERCISES}/${exerciseId}`;

  const handleArchive = async () => {
    if (status === 'ARCHIVED' || archiveInFlight.current) return;

    archiveInFlight.current = true;
    setArchivePending(true);

    try {
      const result = await archiveAdminExercise(exerciseId);
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Não foi possível arquivar o exercício.');
        return;
      }

      setConfirmOpen(false);
      toast.success('Exercício arquivado com sucesso.');
      router.refresh();
    } catch {
      toast.error('Não foi possível arquivar o exercício.');
    } finally {
      archiveInFlight.current = false;
      setArchivePending(false);
    }
  };

  return (
    <>
      <div
        className="flex flex-wrap items-center justify-end gap-1"
        data-testid={`exercise-row-actions-${exerciseId}`}
      >
        <Link
          href={editHref}
          className={actionLinkClass}
          data-testid={`exercise-row-edit-${exerciseId}`}
        >
          Editar
        </Link>
        <Link
          href={`${editHref}/assignments`}
          className={actionLinkClass}
          data-testid={`exercise-row-assign-${exerciseId}`}
        >
          Liberar
        </Link>
        <Link
          href={`${editHref}?tab=review&preview=1`}
          className={actionLinkClass}
          data-testid={`exercise-row-preview-${exerciseId}`}
        >
          Preview como aluno
        </Link>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="min-h-11 min-w-11"
          disabled={status === 'ARCHIVED' || archivePending}
          aria-busy={archivePending}
          aria-haspopup="dialog"
          onClick={() => setConfirmOpen(true)}
          data-testid={`exercise-row-archive-${exerciseId}`}
        >
          Arquivar
        </Button>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => {
          if (!archivePending) setConfirmOpen(false);
        }}
        onConfirm={handleArchive}
        title="Arquivar exercício?"
        message={`O exercício “${internalTitle}” deixará de ficar disponível para novas liberações.`}
        confirmText="Arquivar"
        cancelText="Cancelar"
        dangerLevel="high"
        isLoading={archivePending}
        confirmTestId={`exercise-row-archive-confirm-${exerciseId}`}
        cancelTestId={`exercise-row-archive-cancel-${exerciseId}`}
      />
    </>
  );
}
