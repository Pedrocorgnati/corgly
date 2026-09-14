import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  PropsWithChildren,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAssignment } from '@/actions/admin-exercises';
import type { AdminStudent, AdminStudentsResponse } from '@/actions/admin-students';

const mocks = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
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

type MockToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
};

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: MockToggleProps) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked === true}
      onClick={() => onCheckedChange?.(checked !== true)}
      {...props}
    />
  ),
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, ...props }: MockToggleProps) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked === true}
      onClick={() => onCheckedChange?.(checked !== true)}
      {...props}
    />
  ),
}));

vi.mock('@/components/ui/confirm-modal', () => ({
  ConfirmModal: ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText = 'Cancelar',
    isLoading,
    confirmTestId,
    cancelTestId,
  }: {
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
  }) =>
    isOpen ? (
      <div role="dialog">
        <h2>{title}</h2>
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

import { StudentToggleList } from '@/components/admin/exercises/student-toggle-list';

const EXERCISE_ID = 'exercise-1';
const STORAGE_KEY = `admin-exercise-assignment-selection:${EXERCISE_ID}`;

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function student(id: string): AdminStudent {
  return {
    id,
    name: `Aluno ${id}`,
    email: `${id}@example.com`,
    country: null,
    timezone: null,
    emailConfirmed: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    lastLoginAt: null,
    isActive: true,
    creditBalance: 0,
  };
}

function assignment(
  studentId: string,
  status: 'ACTIVE' | 'REVOKED',
  id = `assignment-${studentId}`,
): AdminAssignment {
  return {
    id,
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

function mutationAssignment(
  studentId: string,
  status: 'ACTIVE' | 'REVOKED',
  id = `assignment-${studentId}`,
) {
  return {
    id,
    studentId,
    status,
    grantedAt: '2026-09-03T12:00:00.000Z',
    revokedAt: status === 'REVOKED' ? '2026-09-04T12:00:00.000Z' : null,
    firstSeenAt: null,
  };
}

function studentsResponse(
  items: AdminStudent[],
  options: Partial<Pick<AdminStudentsResponse, 'total' | 'page' | 'limit'>> = {},
): AdminStudentsResponse {
  return {
    items,
    total: options.total ?? items.length,
    page: options.page ?? 1,
    limit: options.limit ?? 20,
  };
}

function apiResponse(status: number, data: unknown, error: string | null = null): Response {
  return new Response(JSON.stringify({ data, error, message: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface RenderListOptions {
  visibleStudents: AdminStudent[];
  assignments?: AdminAssignment[];
  exerciseId?: string;
  search?: string;
  page?: number;
  total?: number;
  limit?: number;
}

function listElement({
  visibleStudents,
  assignments = [],
  exerciseId = EXERCISE_ID,
  search = '',
  page = 1,
  total = visibleStudents.length,
  limit = 20,
}: RenderListOptions) {
  return (
    <StudentToggleList
      exerciseId={exerciseId}
      students={studentsResponse(visibleStudents, { total, page, limit })}
      assignmentByStudentId={new Map(
        assignments.map((currentAssignment) => [
          currentAssignment.studentId,
          currentAssignment,
        ]),
      )}
      search={search}
      page={page}
    />
  );
}

function renderList(options: RenderListOptions) {
  return render(listElement(options));
}

function selectStudent(studentId: string) {
  fireEvent.click(screen.getByTestId(`student-checkbox-${studentId}`));
}

function requestBody(callIndex = 0): unknown {
  const body = fetchMock.mock.calls[callIndex]?.[1]?.body;
  if (typeof body !== 'string') throw new Error('Requisição sem body JSON.');
  return JSON.parse(body);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe('StudentToggleList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renderiza estados, nomes acessíveis e ícones decorativos corretamente', () => {
    const { container } = renderList({
      visibleStudents: [student('none'), student('active'), student('revoked')],
      assignments: [assignment('active', 'ACTIVE'), assignment('revoked', 'REVOKED')],
    });

    expect(screen.getByTestId('student-status-none')).toHaveTextContent('Não liberado');
    expect(screen.getByTestId('student-status-active')).toHaveTextContent('Liberado');
    expect(screen.getByTestId('student-status-revoked')).toHaveTextContent('Revogado');

    expect(screen.getByTestId('student-toggle-none')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('student-toggle-active')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('student-toggle-revoked')).toHaveAttribute(
      'aria-checked',
      'false',
    );

    expect(screen.getByLabelText('Liberar acesso para Aluno none')).toBeInTheDocument();
    expect(screen.getByLabelText('Revogar acesso de Aluno active')).toBeInTheDocument();
    expect(screen.getByLabelText('Reativar acesso para Aluno revoked')).toBeInTheDocument();
    expect(screen.getByLabelText('Selecionar Aluno none')).toBe(
      screen.getByTestId('student-checkbox-none'),
    );
    expect(screen.getByLabelText('Selecionar todos os alunos desta página')).toBe(
      screen.getByTestId('select-all-checkbox'),
    );
    expect(container.querySelectorAll('svg:not([aria-hidden="true"])')).toHaveLength(0);
  });

  it('reconcilia novas props e preserva override confirmado até o servidor convergir', async () => {
    const assignmentId = 'assignment-reconcile';
    const visibleStudents = [student('reconcile')];
    const view = renderList({
      visibleStudents,
      assignments: [assignment('reconcile', 'ACTIVE', assignmentId)],
    });

    view.rerender(
      listElement({
        visibleStudents,
        assignments: [assignment('reconcile', 'REVOKED', assignmentId)],
      }),
    );
    expect(screen.getByTestId('student-status-reconcile')).toHaveTextContent('Revogado');

    fetchMock.mockResolvedValueOnce(
      apiResponse(201, [mutationAssignment('reconcile', 'ACTIVE', assignmentId)]),
    );
    fireEvent.click(screen.getByTestId('student-toggle-reconcile'));
    await waitFor(() => {
      expect(screen.getByTestId('student-status-reconcile')).toHaveTextContent('Liberado');
    });

    // A navegação pode rerenderizar primeiro com a resposta server antiga.
    view.rerender(
      listElement({
        visibleStudents,
        assignments: [assignment('reconcile', 'REVOKED', assignmentId)],
      }),
    );
    expect(screen.getByTestId('student-status-reconcile')).toHaveTextContent('Liberado');

    // Quando o servidor confirma o estado local, o override é liberado.
    view.rerender(
      listElement({
        visibleStudents,
        assignments: [assignment('reconcile', 'ACTIVE', assignmentId)],
      }),
    );
    view.rerender(
      listElement({
        visibleStudents,
        assignments: [assignment('reconcile', 'REVOKED', assignmentId)],
      }),
    );
    expect(screen.getByTestId('student-status-reconcile')).toHaveTextContent('Revogado');
  });

  it('libera individualmente um aluno sem assignment somente após o POST confirmado', async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse(201, [mutationAssignment('none', 'ACTIVE', 'assignment-new')]),
    );
    renderList({ visibleStudents: [student('none')] });

    fireEvent.click(screen.getByTestId('student-toggle-none'));

    await waitFor(() => {
      expect(screen.getByTestId('student-status-none')).toHaveTextContent('Liberado');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/admin/exercises/${EXERCISE_ID}/assignments`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(requestBody()).toEqual({ studentIds: ['none'] });
    expect(mocks.toast.success).toHaveBeenCalledWith('Acesso liberado');
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
  });

  it('trava reentrada síncrona individual e anuncia o loading de forma acessível', async () => {
    const pendingResponse = deferred<Response>();
    fetchMock.mockReturnValueOnce(pendingResponse.promise);
    renderList({ visibleStudents: [student('locked')] });
    const toggle = screen.getByTestId('student-toggle-locked');

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveAccessibleName(
      'Atualizando acesso de Aluno locked',
    );
    expect(screen.getByTestId('student-loading-locked').querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByTestId('student-checkbox-locked')).toBeDisabled();
    expect(screen.getByTestId('student-search-input')).toBeDisabled();

    pendingResponse.resolve(
      apiResponse(201, [mutationAssignment('locked', 'ACTIVE', 'assignment-locked')]),
    );
    await waitFor(() => {
      expect(screen.getByTestId('student-status-locked')).toHaveTextContent('Liberado');
    });
  });

  it('reativa REVOKED pelo POST e continua usando o mesmo vínculo', async () => {
    const assignmentId = 'assignment-preserved';
    fetchMock
      .mockResolvedValueOnce(
        apiResponse(201, [mutationAssignment('revoked', 'ACTIVE', assignmentId)]),
      )
      .mockResolvedValueOnce(
        apiResponse(200, mutationAssignment('revoked', 'REVOKED', assignmentId)),
      );
    renderList({
      visibleStudents: [student('revoked')],
      assignments: [assignment('revoked', 'REVOKED', assignmentId)],
    });

    fireEvent.click(screen.getByTestId('student-toggle-revoked'));

    await waitFor(() => {
      expect(screen.getByTestId('student-status-revoked')).toHaveTextContent('Liberado');
    });
    expect(requestBody()).toEqual({ studentIds: ['revoked'] });
    expect(mocks.toast.success).toHaveBeenCalledWith('Acesso reativado');

    fireEvent.click(screen.getByTestId('student-toggle-revoked'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('student-status-revoked')).toHaveTextContent('Revogado');
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/api/v1/admin/exercises/${EXERCISE_ID}/assignments/${assignmentId}`,
    );
  });

  it('revoga ACTIVE por DELETE e mantém o registro como REVOKED', async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse(200, mutationAssignment('active', 'REVOKED', 'assignment-active')),
    );
    renderList({
      visibleStudents: [student('active')],
      assignments: [assignment('active', 'ACTIVE', 'assignment-active')],
    });

    fireEvent.click(screen.getByTestId('student-toggle-active'));

    await waitFor(() => {
      expect(screen.getByTestId('student-status-active')).toHaveTextContent('Revogado');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/admin/exercises/${EXERCISE_ID}/assignments/assignment-active`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(screen.getByTestId('student-toggle-active')).toHaveAttribute(
      'aria-label',
      'Reativar acesso para Aluno active',
    );
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
  });

  it('bulk grant envia somente NONE e REVOKED e remove da seleção só os confirmados', async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse(201, [
        mutationAssignment('none', 'ACTIVE', 'assignment-none'),
        mutationAssignment('revoked', 'ACTIVE', 'assignment-revoked'),
      ]),
    );
    renderList({
      visibleStudents: [student('none'), student('active'), student('revoked')],
      assignments: [assignment('active', 'ACTIVE'), assignment('revoked', 'REVOKED')],
    });

    fireEvent.click(screen.getByTestId('select-all-checkbox'));
    expect(screen.getByTestId('selected-students-count')).toHaveTextContent('3 selecionado(s)');
    fireEvent.click(screen.getByTestId('bulk-grant-button'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Liberar 2 alunos?');
    fireEvent.click(screen.getByTestId('confirm-bulk-action'));

    await waitFor(() => {
      expect(screen.getByTestId('student-status-none')).toHaveTextContent('Liberado');
      expect(screen.getByTestId('student-status-revoked')).toHaveTextContent('Liberado');
    });
    expect(requestBody()).toEqual({ studentIds: ['none', 'revoked'] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('selected-students-count')).toHaveTextContent('1 selecionado(s)');
    expect(screen.getByTestId('student-checkbox-active')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
  });

  it('trava confirmação dupla do bulk de forma síncrona e desabilita controles', async () => {
    const pendingResponse = deferred<Response>();
    fetchMock.mockReturnValueOnce(pendingResponse.promise);
    renderList({ visibleStudents: [student('bulk-locked')] });
    selectStudent('bulk-locked');
    fireEvent.click(screen.getByTestId('bulk-grant-button'));
    const confirm = screen.getByTestId('confirm-bulk-action');

    act(() => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('confirm-bulk-action')).toBeDisabled();
    expect(screen.getByTestId('cancel-bulk-action')).toBeDisabled();
    expect(screen.getByTestId('select-all-checkbox')).toBeDisabled();
    expect(screen.getByTestId('clear-selection-button')).toBeDisabled();

    pendingResponse.resolve(
      apiResponse(201, [mutationAssignment('bulk-locked', 'ACTIVE')]),
    );
    await waitFor(() => {
      expect(screen.getByTestId('student-status-bulk-locked')).toHaveTextContent(
        'Liberado',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('resposta parcial do bulk grant confirma e desmarca somente o ID retornado', async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse(201, [
        mutationAssignment('partial-ok', 'ACTIVE'),
        mutationAssignment('id-não-solicitado', 'ACTIVE'),
      ]),
    );
    renderList({
      visibleStudents: [student('partial-ok'), student('partial-missing')],
    });
    fireEvent.click(screen.getByTestId('select-all-checkbox'));
    fireEvent.click(screen.getByTestId('bulk-grant-button'));
    fireEvent.click(screen.getByTestId('confirm-bulk-action'));

    await waitFor(() => {
      expect(mocks.toast.warning).toHaveBeenCalledWith(
        '1 liberado(s), 1 não confirmado(s)',
      );
    });
    expect(screen.getByTestId('student-status-partial-ok')).toHaveTextContent('Liberado');
    expect(screen.getByTestId('student-status-partial-missing')).toHaveTextContent(
      'Não liberado',
    );
    expect(screen.getByTestId('student-checkbox-partial-ok')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByTestId('student-checkbox-partial-missing')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
  });

  it('falha 5xx no bulk grant preserva estados e toda a seleção para retry', async () => {
    fetchMock.mockResolvedValueOnce(apiResponse(500, null, 'Falha no grant em massa.'));
    renderList({
      visibleStudents: [student('grant-none'), student('grant-revoked')],
      assignments: [assignment('grant-revoked', 'REVOKED')],
    });
    fireEvent.click(screen.getByTestId('select-all-checkbox'));
    fireEvent.click(screen.getByTestId('bulk-grant-button'));
    fireEvent.click(screen.getByTestId('confirm-bulk-action'));

    await waitFor(() => {
      expect(mocks.toast.error).toHaveBeenCalledWith('Falha no grant em massa.');
    });
    expect(screen.getByTestId('student-status-grant-none')).toHaveTextContent(
      'Não liberado',
    );
    expect(screen.getByTestId('student-status-grant-revoked')).toHaveTextContent(
      'Revogado',
    );
    expect(screen.getByTestId('selected-students-count')).toHaveTextContent('2 selecionado(s)');
  });

  it('bulk revoke chama DELETE somente para ACTIVE e preserva os inelegíveis selecionados', async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse(200, mutationAssignment('active', 'REVOKED', 'assignment-active')),
    );
    renderList({
      visibleStudents: [student('none'), student('active'), student('revoked')],
      assignments: [
        assignment('active', 'ACTIVE', 'assignment-active'),
        assignment('revoked', 'REVOKED', 'assignment-revoked'),
      ],
    });

    fireEvent.click(screen.getByTestId('select-all-checkbox'));
    fireEvent.click(screen.getByTestId('bulk-revoke-button'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Revogar acesso de 1 alunos?');
    fireEvent.click(screen.getByTestId('confirm-bulk-action'));

    await waitFor(() => {
      expect(screen.getByTestId('student-status-active')).toHaveTextContent('Revogado');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/v1/admin/exercises/${EXERCISE_ID}/assignments/assignment-active`,
    );
    expect(screen.getByTestId('selected-students-count')).toHaveTextContent('2 selecionado(s)');
    expect(screen.getByTestId('student-checkbox-none')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('student-checkbox-revoked')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
  });

  it('falha 4xx no bulk revoke mantém ACTIVE e seleção para nova tentativa', async () => {
    fetchMock.mockResolvedValueOnce(apiResponse(403, null, 'Acesso negado ao revogar.'));
    renderList({
      visibleStudents: [student('revoke-forbidden')],
      assignments: [assignment('revoke-forbidden', 'ACTIVE')],
    });
    selectStudent('revoke-forbidden');
    fireEvent.click(screen.getByTestId('bulk-revoke-button'));
    fireEvent.click(screen.getByTestId('confirm-bulk-action'));

    await waitFor(() => {
      expect(mocks.toast.error).toHaveBeenCalledWith('Acesso negado ao revogar.');
    });
    expect(screen.getByTestId('student-status-revoke-forbidden')).toHaveTextContent(
      'Liberado',
    );
    expect(screen.getByTestId('student-checkbox-revoke-forbidden')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('não emite bulk quando nenhum selecionado é elegível', () => {
    renderList({
      visibleStudents: [student('active'), student('revoked')],
      assignments: [assignment('active', 'ACTIVE'), assignment('revoked', 'REVOKED')],
    });

    selectStudent('active');
    fireEvent.click(screen.getByTestId('bulk-grant-button'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.toast.info).toHaveBeenCalledWith(
      'Nenhum aluno selecionado precisa de liberação',
    );

    selectStudent('active');
    selectStudent('revoked');
    fireEvent.click(screen.getByTestId('bulk-revoke-button'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.toast.info).toHaveBeenCalledWith(
      'Nenhum aluno selecionado tem acesso ativo para revogar',
    );
  });

  it('preserva a seleção ao pesquisar, trocar de página e retornar', async () => {
    const firstPage = renderList({
      visibleStudents: [student('page-1')],
      page: 1,
      total: 2,
      limit: 1,
    });
    selectStudent('page-1');

    await waitFor(() => {
      expect(window.sessionStorage.getItem(STORAGE_KEY)).toContain('page-1');
    });
    fireEvent.change(screen.getByTestId('student-search-input'), {
      target: { value: 'Aluno page-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(mocks.router.push).toHaveBeenCalledWith(
      `/admin/exercises/${EXERCISE_ID}/assignments?search=Aluno+page-2`,
    );
    firstPage.unmount();

    const secondPage = renderList({
      visibleStudents: [student('page-2')],
      search: 'Aluno page-2',
      page: 2,
      total: 2,
      limit: 1,
    });
    expect(await screen.findByTestId('selected-students-count')).toHaveTextContent(
      '1 selecionado(s)',
    );
    selectStudent('page-2');
    await waitFor(() => {
      expect(screen.getByTestId('selected-students-count')).toHaveTextContent(
        '2 selecionado(s)',
      );
    });
    secondPage.unmount();

    renderList({
      visibleStudents: [student('page-1')],
      page: 1,
      total: 2,
      limit: 1,
    });
    await waitFor(() => {
      expect(screen.getByTestId('student-checkbox-page-1')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(screen.getByTestId('selected-students-count')).toHaveTextContent(
        '2 selecionado(s)',
      );
    });
  });

  it('sincroniza busca após navegação sem apagar digitação em rerender equivalente', () => {
    const visibleStudents = [student('search-sync')];
    const view = renderList({ visibleStudents, search: 'Ana' });
    const input = screen.getByTestId('student-search-input');
    expect(input).toHaveValue('Ana');

    fireEvent.change(input, { target: { value: 'Ana digitando' } });
    view.rerender(listElement({ visibleStudents, search: 'Ana' }));
    expect(screen.getByTestId('student-search-input')).toHaveValue('Ana digitando');

    view.rerender(listElement({ visibleStudents, search: 'Bruno' }));
    expect(screen.getByTestId('student-search-input')).toHaveValue('Bruno');
  });

  it('selecionar todos mescla a página visível e desmarcá-la preserva IDs de outra página', async () => {
    const offPage = renderList({
      visibleStudents: [student('off-page')],
      page: 1,
      total: 3,
      limit: 1,
    });
    selectStudent('off-page');
    offPage.unmount();

    renderList({
      visibleStudents: [student('visible-1'), student('visible-2')],
      page: 2,
      total: 3,
      limit: 2,
    });

    expect(await screen.findByTestId('selected-students-count')).toHaveTextContent(
      '1 selecionado(s)',
    );
    fireEvent.click(screen.getByTestId('select-all-checkbox'));
    expect(screen.getByTestId('selected-students-count')).toHaveTextContent('3 selecionado(s)');

    fireEvent.click(screen.getByTestId('select-all-checkbox'));
    expect(screen.getByTestId('selected-students-count')).toHaveTextContent('1 selecionado(s)');
    await waitFor(() => {
      expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([
        'off-page',
      ]);
    });
  });

  it('mantém estados off-page conhecidos, remove ID stale e nunca o envia no bulk', async () => {
    const knownAssignments = [
      assignment('off-active', 'ACTIVE'),
      assignment('off-revoked', 'REVOKED'),
    ];
    const registryPage = renderList({
      visibleStudents: [student('off-none')],
      assignments: knownAssignments,
      page: 1,
      total: 4,
      limit: 1,
    });
    await waitFor(() => {
      expect(screen.getByTestId('student-toggle-list-panel')).toBeInTheDocument();
    });
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['off-none', 'off-active', 'off-revoked', 'stale-adulterado']),
    );
    registryPage.unmount();

    fetchMock.mockResolvedValueOnce(
      apiResponse(201, [
        mutationAssignment('off-none', 'ACTIVE'),
        mutationAssignment('off-revoked', 'ACTIVE'),
      ]),
    );
    renderList({
      visibleStudents: [student('current-page')],
      assignments: knownAssignments,
      page: 2,
      total: 4,
      limit: 1,
    });

    expect(await screen.findByTestId('selected-students-count')).toHaveTextContent(
      '3 selecionado(s)',
    );
    await waitFor(() => {
      const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '[]');
      expect(stored.sort()).toEqual(['off-active', 'off-none', 'off-revoked']);
    });

    fireEvent.click(screen.getByTestId('bulk-grant-button'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Liberar 2 alunos?');
    fireEvent.click(screen.getByTestId('confirm-bulk-action'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestBody()).toEqual({ studentIds: ['off-none', 'off-revoked'] });
    expect(JSON.stringify(requestBody())).not.toContain('stale-adulterado');
    expect(screen.getByTestId('selected-students-count')).toHaveTextContent('1 selecionado(s)');

    fireEvent.click(screen.getByTestId('clear-selection-button'));
    expect(screen.queryByTestId('selected-students-count')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('bulk revoke off-page processa ACTIVE e preserva REVOKED sem request indevido', async () => {
    const knownAssignments = [
      assignment('remote-active', 'ACTIVE'),
      assignment('remote-revoked', 'REVOKED'),
    ];
    const registryPage = renderList({
      visibleStudents: [student('registry-page')],
      assignments: knownAssignments,
    });
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['remote-active', 'remote-revoked', 'stale-remote']),
    );
    registryPage.unmount();

    fetchMock.mockResolvedValueOnce(
      apiResponse(200, mutationAssignment('remote-active', 'REVOKED')),
    );
    renderList({
      visibleStudents: [student('other-page')],
      assignments: knownAssignments,
    });
    expect(await screen.findByTestId('selected-students-count')).toHaveTextContent(
      '2 selecionado(s)',
    );

    fireEvent.click(screen.getByTestId('bulk-revoke-button'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Revogar acesso de 1 alunos?');
    fireEvent.click(screen.getByTestId('confirm-bulk-action'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/v1/admin/exercises/${EXERCISE_ID}/assignments/assignment-remote-active`,
    );
    expect(screen.getByTestId('selected-students-count')).toHaveTextContent('1 selecionado(s)');
  });

  it('mantém seleção no cache quando sessionStorage está indisponível', async () => {
    const exerciseId = 'exercise-storage-failure';
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage bloqueado');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage bloqueado');
    });

    const firstMount = renderList({
      exerciseId,
      visibleStudents: [student('storage-known')],
    });
    selectStudent('storage-known');
    expect(screen.getByTestId('selected-students-count')).toHaveTextContent('1 selecionado(s)');
    firstMount.unmount();

    renderList({
      exerciseId,
      visibleStudents: [student('storage-known')],
    });
    expect(await screen.findByTestId('selected-students-count')).toHaveTextContent(
      '1 selecionado(s)',
    );
    fireEvent.click(screen.getByTestId('clear-selection-button'));
    expect(screen.queryByTestId('selected-students-count')).not.toBeInTheDocument();
  });

  it('falha 4xx individual não altera o estado nem remove a seleção', async () => {
    fetchMock.mockResolvedValueOnce(apiResponse(409, null, 'Conflito ao reativar.'));
    renderList({
      visibleStudents: [student('revoked')],
      assignments: [assignment('revoked', 'REVOKED')],
    });
    selectStudent('revoked');

    fireEvent.click(screen.getByTestId('student-toggle-revoked'));

    await waitFor(() => {
      expect(mocks.toast.error).toHaveBeenCalledWith('Conflito ao reativar.');
    });
    expect(screen.getByTestId('student-status-revoked')).toHaveTextContent('Revogado');
    expect(screen.getByTestId('student-checkbox-revoked')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('selected-students-count')).toHaveTextContent('1 selecionado(s)');
  });

  it('falha 5xx parcial no bulk revoke confirma só sucessos e mantém falhas para retry', async () => {
    fetchMock
      .mockResolvedValueOnce(
        apiResponse(200, mutationAssignment('active-1', 'REVOKED', 'assignment-active-1')),
      )
      .mockResolvedValueOnce(apiResponse(500, null, 'Falha ao revogar active-2.'));
    renderList({
      visibleStudents: [student('active-1'), student('active-2')],
      assignments: [
        assignment('active-1', 'ACTIVE', 'assignment-active-1'),
        assignment('active-2', 'ACTIVE', 'assignment-active-2'),
      ],
    });

    fireEvent.click(screen.getByTestId('select-all-checkbox'));
    fireEvent.click(screen.getByTestId('bulk-revoke-button'));
    fireEvent.click(screen.getByTestId('confirm-bulk-action'));

    await waitFor(() => {
      expect(mocks.toast.warning).toHaveBeenCalledWith('1 revogado(s), 1 falhou/falharam');
    });
    expect(screen.getByTestId('student-status-active-1')).toHaveTextContent('Revogado');
    expect(screen.getByTestId('student-status-active-2')).toHaveTextContent('Liberado');
    expect(screen.getByTestId('student-checkbox-active-1')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByTestId('student-checkbox-active-2')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('selected-students-count')).toHaveTextContent('1 selecionado(s)');
  });
});
