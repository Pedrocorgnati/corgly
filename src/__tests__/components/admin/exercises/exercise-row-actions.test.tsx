import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AnchorHTMLAttributes, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  archiveAdminExercise: vi.fn(),
  router: {
    refresh: vi.fn(),
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/actions/admin-exercises', () => ({
  archiveAdminExercise: mocks.archiveAdminExercise,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: PropsWithChildren<{ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('sonner', () => ({
  toast: mocks.toast,
}));

interface MockConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  confirmTestId?: string;
  cancelTestId?: string;
}

vi.mock('@/components/ui/confirm-modal', () => ({
  ConfirmModal: ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    isLoading = false,
    confirmTestId,
    cancelTestId,
  }: MockConfirmModalProps) =>
    isOpen ? (
      <div role="dialog" aria-labelledby="mock-confirm-title">
        <h2 id="mock-confirm-title">{title}</h2>
        <p>{message}</p>
        <button
          type="button"
          data-testid={cancelTestId}
          disabled={isLoading}
          onClick={onClose}
        >
          {cancelText}
        </button>
        <button
          type="button"
          data-testid={confirmTestId}
          disabled={isLoading}
          onClick={() => void onConfirm()}
        >
          {confirmText}
        </button>
      </div>
    ) : null,
}));

import { ExerciseRowActions } from '@/components/admin/exercises/exercise-row-actions';

const EXERCISE_ID = '2d833df8-7809-4f26-9428-93ce91786f80';
const INTERNAL_TITLE = 'Past simple: verbos regulares';

function renderActions(status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' = 'PUBLISHED') {
  return render(
    <ExerciseRowActions
      exerciseId={EXERCISE_ID}
      internalTitle={INTERNAL_TITLE}
      status={status}
    />,
  );
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe('ExerciseRowActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.archiveAdminExercise.mockResolvedValue({
      data: { id: EXERCISE_ID, status: 'ARCHIVED' },
      error: null,
    });
  });

  it('renderiza os três links canônicos e deixa Arquivar como única mutação', () => {
    renderActions();

    const actions = screen.getByTestId(`exercise-row-actions-${EXERCISE_ID}`);
    const links = within(actions).getAllByRole('link');

    expect(links).toHaveLength(3);
    expect(within(actions).getByTestId(`exercise-row-edit-${EXERCISE_ID}`)).toHaveAttribute(
      'href',
      `/admin/exercises/${EXERCISE_ID}`,
    );
    expect(within(actions).getByTestId(`exercise-row-assign-${EXERCISE_ID}`)).toHaveAttribute(
      'href',
      `/admin/exercises/${EXERCISE_ID}/assignments`,
    );
    expect(
      within(actions).getByTestId(`exercise-row-preview-${EXERCISE_ID}`),
    ).toHaveAttribute(
      'href',
      `/admin/exercises/${EXERCISE_ID}?tab=review&preview=1`,
    );
    expect(within(actions).getAllByRole('button')).toHaveLength(1);
    expect(within(actions).getByTestId(`exercise-row-archive-${EXERCISE_ID}`)).toBeEnabled();
    expect(screen.queryByText(/duplicar/i)).not.toBeInTheDocument();
    expect(mocks.archiveAdminExercise).not.toHaveBeenCalled();
  });

  it('abre a confirmação com contexto e permite cancelar sem mutação', () => {
    renderActions();

    fireEvent.click(screen.getByTestId(`exercise-row-archive-${EXERCISE_ID}`));

    expect(screen.getByRole('dialog', { name: 'Arquivar exercício?' })).toBeVisible();
    expect(
      screen.getByText(
        `O exercício “${INTERNAL_TITLE}” deixará de ficar disponível para novas liberações.`,
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByTestId(`exercise-row-archive-cancel-${EXERCISE_ID}`));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.archiveAdminExercise).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it('bloqueia duplo clique durante pending e conclui com toast, refresh e fechamento', async () => {
    const pending = deferred<{
      data: { id: string; status: 'ARCHIVED' };
      error: null;
    }>();
    mocks.archiveAdminExercise.mockReturnValueOnce(pending.promise);
    renderActions();

    const archiveButton = screen.getByTestId(`exercise-row-archive-${EXERCISE_ID}`);
    fireEvent.click(archiveButton);
    const confirmButton = screen.getByTestId(
      `exercise-row-archive-confirm-${EXERCISE_ID}`,
    );

    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(mocks.archiveAdminExercise).toHaveBeenCalledTimes(1);
    expect(mocks.archiveAdminExercise).toHaveBeenCalledWith(EXERCISE_ID);
    expect(archiveButton).toBeDisabled();
    expect(archiveButton).toHaveAttribute('aria-busy', 'true');
    expect(confirmButton).toBeDisabled();
    expect(
      screen.getByTestId(`exercise-row-archive-cancel-${EXERCISE_ID}`),
    ).toBeDisabled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({
        data: { id: EXERCISE_ID, status: 'ARCHIVED' },
        error: null,
      });
      await pending.promise;
    });

    await waitFor(() => {
      expect(mocks.toast.success).toHaveBeenCalledWith(
        'Exercício arquivado com sucesso.',
      );
      expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it('mantém a confirmação aberta e não atualiza a página quando a action falha', async () => {
    mocks.archiveAdminExercise.mockResolvedValueOnce({
      data: null,
      error: 'O exercício ainda possui uma sessão em andamento.',
    });
    renderActions();

    fireEvent.click(screen.getByTestId(`exercise-row-archive-${EXERCISE_ID}`));
    fireEvent.click(screen.getByTestId(`exercise-row-archive-confirm-${EXERCISE_ID}`));

    await waitFor(() => {
      expect(mocks.toast.error).toHaveBeenCalledWith(
        'O exercício ainda possui uma sessão em andamento.',
      );
    });

    expect(screen.getByRole('dialog', { name: 'Arquivar exercício?' })).toBeVisible();
    expect(
      screen.getByTestId(`exercise-row-archive-confirm-${EXERCISE_ID}`),
    ).toBeEnabled();
    expect(screen.getByTestId(`exercise-row-archive-${EXERCISE_ID}`)).toBeEnabled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it('trata rejeição inesperada sem refresh e libera uma nova tentativa', async () => {
    mocks.archiveAdminExercise.mockRejectedValueOnce(new Error('network down'));
    renderActions();

    fireEvent.click(screen.getByTestId(`exercise-row-archive-${EXERCISE_ID}`));
    fireEvent.click(screen.getByTestId(`exercise-row-archive-confirm-${EXERCISE_ID}`));

    await waitFor(() => {
      expect(mocks.toast.error).toHaveBeenCalledWith(
        'Não foi possível arquivar o exercício.',
      );
    });

    expect(screen.getByRole('dialog', { name: 'Arquivar exercício?' })).toBeVisible();
    expect(
      screen.getByTestId(`exercise-row-archive-confirm-${EXERCISE_ID}`),
    ).toBeEnabled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it('mantém os links, mas desabilita Arquivar para exercício já arquivado', () => {
    renderActions('ARCHIVED');

    const actions = screen.getByTestId(`exercise-row-actions-${EXERCISE_ID}`);
    expect(within(actions).getAllByRole('link')).toHaveLength(3);

    const archiveButton = within(actions).getByTestId(`exercise-row-archive-${EXERCISE_ID}`);
    expect(archiveButton).toBeDisabled();
    expect(archiveButton).toHaveAttribute('aria-busy', 'false');

    fireEvent.click(archiveButton);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.archiveAdminExercise).not.toHaveBeenCalled();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });
});
