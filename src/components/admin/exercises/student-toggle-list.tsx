'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ROUTES } from '@/lib/constants';
import type { AdminAssignment } from '@/actions/admin-exercises';
import type { AdminStudent, AdminStudentsResponse } from '@/actions/admin-students';

interface StudentToggleListProps {
  exerciseId: string;
  students: AdminStudentsResponse;
  assignmentByStudentId: Map<string, AdminAssignment>;
  search: string;
  page: number;
}

type AssignmentState = 'NONE' | 'ACTIVE' | 'REVOKED';

/**
 * POST/DELETE devolvem a linha do assignment sem o relacionamento `student`.
 * A listagem inicial traz o relacionamento completo, mas as transições locais
 * precisam somente desta parte estável do contrato.
 */
type AssignmentRecord = Pick<AdminAssignment, 'id' | 'studentId' | 'status'> &
  Partial<Omit<AdminAssignment, 'id' | 'studentId' | 'status'>>;

type StudentWithAssignment = AdminStudent & {
  assignment?: AssignmentRecord;
};

interface ApiEnvelope {
  data: unknown;
  error?: unknown;
}

interface SelectionSnapshot {
  serialized: string | null;
  ids: ReadonlySet<string>;
  fallback: boolean;
}

interface AssignmentViewState {
  source: Map<string, AdminAssignment>;
  effective: Map<string, AssignmentRecord>;
  confirmedOverrideIds: ReadonlySet<string>;
}

interface SearchViewState {
  committed: string;
  input: string;
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set();
const selectionSnapshots = new Map<string, SelectionSnapshot>();
const selectionListeners = new Map<string, Set<() => void>>();
const knownStudentIdsBySelection = new Map<string, Set<string>>();
const STORAGE_UNAVAILABLE = Symbol('storage-unavailable');

type StoredSelectionValue = string | null | typeof STORAGE_UNAVAILABLE;

function getAssignmentState(assignment?: AssignmentRecord): AssignmentState {
  if (!assignment) return 'NONE';
  return assignment.status;
}

function asAssignmentRecord(value: unknown): AssignmentRecord | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.studentId !== 'string' ||
    (candidate.status !== 'ACTIVE' && candidate.status !== 'REVOKED')
  ) {
    return null;
  }

  return candidate as unknown as AssignmentRecord;
}

async function readEnvelope(response: Response): Promise<ApiEnvelope | null> {
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || !('data' in value)) return null;
    return value as ApiEnvelope;
  } catch {
    return null;
  }
}

function responseError(envelope: ApiEnvelope | null, fallback: string): string {
  return typeof envelope?.error === 'string' && envelope.error.length > 0
    ? envelope.error
    : fallback;
}

function activeAssignmentsFromResponse(
  envelope: ApiEnvelope | null,
  requestedStudentIds: readonly string[],
): AssignmentRecord[] {
  if (!Array.isArray(envelope?.data)) return [];

  const requested = new Set(requestedStudentIds);
  const assignments = new Map<string, AssignmentRecord>();

  envelope.data.forEach((value) => {
    const assignment = asAssignmentRecord(value);
    if (
      assignment?.status === 'ACTIVE' &&
      requested.has(assignment.studentId)
    ) {
      assignments.set(assignment.studentId, assignment);
    }
  });

  return Array.from(assignments.values());
}

function assignmentsConverged(
  localAssignment: AssignmentRecord,
  serverAssignment?: AssignmentRecord,
) {
  return (
    serverAssignment?.id === localAssignment.id &&
    serverAssignment.status === localAssignment.status
  );
}

function reconcileAssignments(
  current: AssignmentViewState,
  source: Map<string, AdminAssignment>,
): AssignmentViewState {
  const effective = new Map<string, AssignmentRecord>(source);
  const confirmedOverrideIds = new Set<string>();

  current.confirmedOverrideIds.forEach((studentId) => {
    const localAssignment = current.effective.get(studentId);
    if (!localAssignment) return;

    if (!assignmentsConverged(localAssignment, source.get(studentId))) {
      effective.set(studentId, localAssignment);
      confirmedOverrideIds.add(studentId);
    }
  });

  return { source, effective, confirmedOverrideIds };
}

function storedSelectionValue(storageKey: string): StoredSelectionValue {
  if (typeof window === 'undefined') return STORAGE_UNAVAILABLE;
  try {
    return window.sessionStorage.getItem(storageKey);
  } catch {
    return STORAGE_UNAVAILABLE;
  }
}

function selectionSnapshot(storageKey: string): ReadonlySet<string> {
  const serialized = storedSelectionValue(storageKey);
  const cached = selectionSnapshots.get(storageKey);
  if (serialized === STORAGE_UNAVAILABLE || cached?.fallback) {
    return cached?.ids ?? EMPTY_SELECTION;
  }
  if (cached?.serialized === serialized) return cached.ids;

  let ids: ReadonlySet<string> = EMPTY_SELECTION;
  const knownStudentIds = knownStudentIdsBySelection.get(storageKey) ?? EMPTY_SELECTION;
  try {
    const parsed: unknown = serialized ? JSON.parse(serialized) : [];
    if (Array.isArray(parsed)) {
      ids = new Set(
        parsed.filter(
          (id): id is string => typeof id === 'string' && knownStudentIds.has(id),
        ),
      );
    }
  } catch {
    // Conteúdo inválido equivale a uma seleção vazia.
  }

  selectionSnapshots.set(storageKey, { serialized, ids, fallback: false });
  return ids;
}

function subscribeToSelection(storageKey: string, listener: () => void) {
  const listeners = selectionListeners.get(storageKey) ?? new Set<() => void>();
  listeners.add(listener);
  selectionListeners.set(storageKey, listeners);

  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea !== window.sessionStorage || event.key !== storageKey) return;
    selectionSnapshots.delete(storageKey);
    listeners.forEach((currentListener) => currentListener());
  };
  window.addEventListener('storage', handleStorage);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) selectionListeners.delete(storageKey);
    window.removeEventListener('storage', handleStorage);
  };
}

function persistSelection(storageKey: string, ids: ReadonlySet<string>) {
  const knownStudentIds = knownStudentIdsBySelection.get(storageKey) ?? EMPTY_SELECTION;
  const snapshot = new Set(Array.from(ids).filter((id) => knownStudentIds.has(id)));
  const serialized = snapshot.size > 0 ? JSON.stringify(Array.from(snapshot)) : null;
  let fallback = false;

  try {
    if (serialized === null) window.sessionStorage.removeItem(storageKey);
    else window.sessionStorage.setItem(storageKey, serialized);
  } catch {
    fallback = true;
  }

  selectionSnapshots.set(storageKey, { serialized, ids: snapshot, fallback });
  selectionListeners.get(storageKey)?.forEach((listener) => listener());
}

function rememberKnownStudentIds(storageKey: string, studentIds: ReadonlySet<string>) {
  const knownStudentIds = knownStudentIdsBySelection.get(storageKey) ?? new Set<string>();
  studentIds.forEach((studentId) => knownStudentIds.add(studentId));
  knownStudentIdsBySelection.set(storageKey, knownStudentIds);

  const cached = selectionSnapshots.get(storageKey);
  const storageValue = storedSelectionValue(storageKey);
  const cachedIds =
    storageValue === STORAGE_UNAVAILABLE || cached?.fallback ? cached?.ids : undefined;
  selectionSnapshots.delete(storageKey);
  persistSelection(
    storageKey,
    cachedIds ?? selectionSnapshot(storageKey),
  );
}

function usePersistentSelection(
  exerciseId: string,
  currentlyKnownStudentIds: ReadonlySet<string>,
) {
  const storageKey = `admin-exercise-assignment-selection:${exerciseId}`;
  const subscribe = useCallback(
    (listener: () => void) => subscribeToSelection(storageKey, listener),
    [storageKey],
  );
  const getSnapshot = useCallback(() => selectionSnapshot(storageKey), [storageKey]);
  const selectedStudentIds = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_SELECTION,
  );

  useEffect(() => {
    rememberKnownStudentIds(storageKey, currentlyKnownStudentIds);
  }, [currentlyKnownStudentIds, storageKey]);

  const updateSelection = useCallback(
    (updater: (current: ReadonlySet<string>) => Set<string>) => {
      rememberKnownStudentIds(storageKey, currentlyKnownStudentIds);
      persistSelection(storageKey, updater(selectionSnapshot(storageKey)));
    },
    [currentlyKnownStudentIds, storageKey],
  );

  const clearSelection = useCallback(() => {
    persistSelection(storageKey, EMPTY_SELECTION);
  }, [storageKey]);

  const isKnownStudentId = useCallback(
    (studentId: string) => knownStudentIdsBySelection.get(storageKey)?.has(studentId) === true,
    [storageKey],
  );

  return { selectedStudentIds, updateSelection, clearSelection, isKnownStudentId };
}

export function StudentToggleList({
  exerciseId,
  students,
  assignmentByStudentId,
  search,
  page,
}: StudentToggleListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assignmentView, setAssignmentView] = useState<AssignmentViewState>(
    () => ({
      source: assignmentByStudentId,
      effective: new Map<string, AssignmentRecord>(assignmentByStudentId),
      confirmedOverrideIds: new Set(),
    }),
  );
  if (assignmentView.source !== assignmentByStudentId) {
    setAssignmentView(reconcileAssignments(assignmentView, assignmentByStudentId));
  }

  const localAssignments = assignmentView.effective;
  const currentlyKnownStudentIds = useMemo(
    () =>
      new Set([
        ...students.items.map((student) => student.id),
        ...assignmentByStudentId.keys(),
      ]),
    [assignmentByStudentId, students.items],
  );
  const {
    selectedStudentIds,
    updateSelection,
    clearSelection,
    isKnownStudentId,
  } = usePersistentSelection(exerciseId, currentlyKnownStudentIds);
  const [loadingStudentIds, setLoadingStudentIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const mutationLockRef = useRef(false);
  const [confirmModal, setConfirmModal] = useState<{
    type: 'grant' | 'revoke';
    count: number;
  } | null>(null);
  const [searchView, setSearchView] = useState<SearchViewState>(() => ({
    committed: search,
    input: search,
  }));
  if (searchView.committed !== search) {
    setSearchView({ committed: search, input: search });
  }
  const searchInput = searchView.input;

  const assignmentForStudent = useCallback(
    (studentId: string): AssignmentRecord | undefined => localAssignments.get(studentId),
    [localAssignments],
  );

  const studentsWithAssignments: StudentWithAssignment[] = useMemo(
    () =>
      students.items.map((student) => ({
        ...student,
        assignment: assignmentForStudent(student.id),
      })),
    [assignmentForStudent, students.items],
  );

  const totalPages = Math.ceil(students.total / students.limit);

  const setConfirmedAssignments = useCallback((assignments: readonly AssignmentRecord[]) => {
    setAssignmentView((current) => {
      const effective = new Map(current.effective);
      const confirmedOverrideIds = new Set(current.confirmedOverrideIds);

      assignments.forEach((assignment) => {
        const previous = effective.get(assignment.studentId);
        effective.set(
          assignment.studentId,
          previous ? { ...previous, ...assignment } : assignment,
        );
        confirmedOverrideIds.add(assignment.studentId);
      });

      return { ...current, effective, confirmedOverrideIds };
    });
  }, []);

  const markLoading = useCallback((studentIds: readonly string[], loading: boolean) => {
    setLoadingStudentIds((current) => {
      const next = new Set(current);
      studentIds.forEach((studentId) => {
        if (loading) next.add(studentId);
        else next.delete(studentId);
      });
      return next;
    });
  }, []);

  const acquireMutation = useCallback(
    (studentIds: readonly string[], bulk: boolean) => {
      if (mutationLockRef.current) return false;
      mutationLockRef.current = true;
      setMutationPending(true);
      setBulkPending(bulk);
      markLoading(studentIds, true);
      return true;
    },
    [markLoading],
  );

  const releaseMutation = useCallback(
    (studentIds: readonly string[]) => {
      mutationLockRef.current = false;
      markLoading(studentIds, false);
      setBulkPending(false);
      setMutationPending(false);
    },
    [markLoading],
  );

  const grantEligibleStudentIds = useCallback(
    () =>
      Array.from(selectedStudentIds).filter(
        (studentId) =>
          isKnownStudentId(studentId) &&
          getAssignmentState(assignmentForStudent(studentId)) !== 'ACTIVE',
      ),
    [assignmentForStudent, isKnownStudentId, selectedStudentIds],
  );

  const revokeEligibleAssignments = useCallback(
    () =>
      Array.from(selectedStudentIds).flatMap((studentId) => {
        if (!isKnownStudentId(studentId)) return [];
        const assignment = assignmentForStudent(studentId);
        return assignment?.status === 'ACTIVE' ? [assignment] : [];
      }),
    [assignmentForStudent, isKnownStudentId, selectedStudentIds],
  );

  const handleToggle = useCallback(
    async (studentId: string, currentAssignment?: AssignmentRecord) => {
      const currentState = getAssignmentState(currentAssignment);
      if (!acquireMutation([studentId], false)) return;

      try {
        if (currentState === 'ACTIVE' && currentAssignment) {
          const response = await fetch(
            `/api/v1/admin/exercises/${exerciseId}/assignments/${currentAssignment.id}`,
            {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
            },
          );
          const envelope = await readEnvelope(response);

          if (!response.ok) {
            toast.error(responseError(envelope, 'Erro ao revogar acesso'));
            return;
          }

          const revoked = asAssignmentRecord(envelope?.data);
          if (
            !revoked ||
            revoked.studentId !== studentId ||
            revoked.status !== 'REVOKED'
          ) {
            toast.error('Resposta inválida ao revogar acesso');
            return;
          }

          setConfirmedAssignments([revoked]);
          router.refresh();
          toast.success('Acesso revogado');
          return;
        }

        const response = await fetch(`/api/v1/admin/exercises/${exerciseId}/assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentIds: [studentId] }),
        });
        const envelope = await readEnvelope(response);

        if (!response.ok) {
          toast.error(responseError(envelope, 'Erro ao liberar acesso'));
          return;
        }

        const granted = activeAssignmentsFromResponse(envelope, [studentId])[0];
        if (!granted) {
          toast.error('Resposta inválida ao liberar acesso');
          return;
        }

        setConfirmedAssignments([granted]);
        router.refresh();
        toast.success(currentState === 'REVOKED' ? 'Acesso reativado' : 'Acesso liberado');
      } catch {
        toast.error('Erro de conexão');
      } finally {
        releaseMutation([studentId]);
      }
    },
    [acquireMutation, exerciseId, releaseMutation, router, setConfirmedAssignments],
  );

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      const visibleStudentIds = students.items.map((student) => student.id);
      updateSelection((current) => {
        const next = new Set(current);
        visibleStudentIds.forEach((studentId) => {
          if (checked) next.add(studentId);
          else next.delete(studentId);
        });
        return next;
      });
    },
    [students.items, updateSelection],
  );

  const handleSelectStudent = useCallback(
    (studentId: string, checked: boolean) => {
      updateSelection((current) => {
        const next = new Set(current);
        if (checked) next.add(studentId);
        else next.delete(studentId);
        return next;
      });
    },
    [updateSelection],
  );

  const handleBulkAction = useCallback(
    (type: 'grant' | 'revoke') => {
      const count =
        type === 'grant'
          ? grantEligibleStudentIds().length
          : revokeEligibleAssignments().length;

      if (count === 0) {
        toast.info(
          type === 'grant'
            ? 'Nenhum aluno selecionado precisa de liberação'
            : 'Nenhum aluno selecionado tem acesso ativo para revogar',
        );
        return;
      }

      setConfirmModal({ type, count });
    },
    [grantEligibleStudentIds, revokeEligibleAssignments],
  );

  const executeBulkGrant = useCallback(async () => {
    const studentIds = grantEligibleStudentIds();
    if (studentIds.length === 0) {
      setConfirmModal(null);
      return;
    }
    if (!acquireMutation(studentIds, true)) return;

    try {
      const response = await fetch(`/api/v1/admin/exercises/${exerciseId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds }),
      });
      const envelope = await readEnvelope(response);

      if (!response.ok) {
        toast.error(responseError(envelope, 'Erro ao liberar em massa'));
        return;
      }

      const assignments = activeAssignmentsFromResponse(envelope, studentIds);
      if (assignments.length === 0) {
        toast.error('Resposta inválida ao liberar em massa');
        return;
      }

      setConfirmedAssignments(assignments);
      router.refresh();

      const processedStudentIds = new Set(
        assignments.map((assignment) => assignment.studentId),
      );
      updateSelection((current) => {
        const next = new Set(current);
        processedStudentIds.forEach((studentId) => next.delete(studentId));
        return next;
      });

      if (assignments.length === studentIds.length) {
        toast.success(`${assignments.length} aluno(s) liberado(s)`);
      } else {
        toast.warning(
          `${assignments.length} liberado(s), ${studentIds.length - assignments.length} não confirmado(s)`,
        );
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      releaseMutation(studentIds);
      setConfirmModal(null);
    }
  }, [
    acquireMutation,
    exerciseId,
    grantEligibleStudentIds,
    releaseMutation,
    router,
    setConfirmedAssignments,
    updateSelection,
  ]);

  const executeBulkRevoke = useCallback(async () => {
    const assignments = revokeEligibleAssignments();
    if (assignments.length === 0) {
      setConfirmModal(null);
      return;
    }

    const studentIds = assignments.map((assignment) => assignment.studentId);
    if (!acquireMutation(studentIds, true)) return;

    const revokedAssignments: AssignmentRecord[] = [];
    const failureMessages: string[] = [];

    try {
      for (const assignment of assignments) {
        try {
          const response = await fetch(
            `/api/v1/admin/exercises/${exerciseId}/assignments/${assignment.id}`,
            {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
            },
          );
          const envelope = await readEnvelope(response);

          if (!response.ok) {
            failureMessages.push(responseError(envelope, 'Erro ao revogar acesso'));
            continue;
          }

          const revoked = asAssignmentRecord(envelope?.data);
          if (
            !revoked ||
            revoked.studentId !== assignment.studentId ||
            revoked.status !== 'REVOKED'
          ) {
            failureMessages.push('Resposta inválida ao revogar acesso');
            continue;
          }

          revokedAssignments.push(revoked);
        } catch {
          failureMessages.push('Erro de conexão');
        }
      }

      if (revokedAssignments.length > 0) {
        setConfirmedAssignments(revokedAssignments);
        router.refresh();

        const processedStudentIds = new Set(
          revokedAssignments.map((assignment) => assignment.studentId),
        );
        updateSelection((current) => {
          const next = new Set(current);
          processedStudentIds.forEach((studentId) => next.delete(studentId));
          return next;
        });
      }

      if (failureMessages.length === 0) {
        toast.success(`${revokedAssignments.length} aluno(s) tiveram acesso revogado`);
      } else if (revokedAssignments.length > 0) {
        toast.warning(
          `${revokedAssignments.length} revogado(s), ${failureMessages.length} falhou/falharam`,
        );
      } else {
        toast.error(failureMessages[0] ?? 'Erro ao revogar em massa');
      }
    } finally {
      releaseMutation(studentIds);
      setConfirmModal(null);
    }
  }, [
    acquireMutation,
    exerciseId,
    releaseMutation,
    revokeEligibleAssignments,
    router,
    setConfirmedAssignments,
    updateSelection,
  ]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    startTransition(() => {
      const params = new URLSearchParams();
      if (searchInput) params.set('search', searchInput);
      const query = params.toString();
      router.push(
        `${ROUTES.ADMIN_EXERCISES}/${exerciseId}/assignments${query ? `?${query}` : ''}`,
      );
    });
  };

  return (
    <>
      <Card data-testid="student-toggle-list-panel">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" aria-hidden="true" />
              Alunos
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              {students.total} aluno(s)
            </span>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2 mt-3">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="Buscar aluno..."
                aria-label="Buscar aluno"
                value={searchInput}
                onChange={(event) =>
                  setSearchView((current) => ({
                    ...current,
                    input: event.target.value,
                  }))
                }
                disabled={mutationPending}
                className="pl-9"
                data-testid="student-search-input"
              />
            </div>
            <Button type="submit" size="sm" disabled={isPending || mutationPending}>
              Buscar
            </Button>
          </form>

          {selectedStudentIds.size > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <span
                className="text-sm text-muted-foreground"
                data-testid="selected-students-count"
                aria-live="polite"
              >
                {selectedStudentIds.size} selecionado(s)
              </span>
              <Button
                size="sm"
                variant="default"
                onClick={() => handleBulkAction('grant')}
                disabled={mutationPending}
                data-testid="bulk-grant-button"
              >
                Liberar selecionados
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleBulkAction('revoke')}
                disabled={mutationPending}
                data-testid="bulk-revoke-button"
              >
                Revogar selecionados
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearSelection}
                disabled={mutationPending}
                data-testid="clear-selection-button"
              >
                Limpar seleção
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {students.items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {search ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3 py-2 border-b mb-2">
                <Checkbox
                  id={`select-all-${exerciseId}`}
                  checked={students.items.every((student) =>
                    selectedStudentIds.has(student.id),
                  )}
                  onCheckedChange={(checked) => handleSelectAll(checked === true)}
                  disabled={mutationPending}
                  aria-label="Selecionar todos os alunos desta página"
                  data-testid="select-all-checkbox"
                />
                <label
                  htmlFor={`select-all-${exerciseId}`}
                  className="text-sm text-muted-foreground cursor-pointer"
                >
                  Selecionar todos
                </label>
              </div>

              <div className="space-y-2">
                {studentsWithAssignments.map((student) => {
                  const isLoading = loadingStudentIds.has(student.id);
                  const isSelected = selectedStudentIds.has(student.id);
                  const assignmentState = getAssignmentState(student.assignment);

                  return (
                    <div
                      key={student.id}
                      data-testid={`student-row-${student.id}`}
                      className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={`student-select-${student.id}`}
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            handleSelectStudent(student.id, checked === true)
                          }
                          disabled={mutationPending}
                          aria-label={`Selecionar ${student.name}`}
                          data-testid={`student-checkbox-${student.id}`}
                        />
                        <label
                          htmlFor={`student-select-${student.id}`}
                          className="cursor-pointer"
                        >
                          <p className="font-medium text-sm">{student.name}</p>
                          <p className="text-xs text-muted-foreground">{student.email}</p>
                        </label>
                        <Badge
                          variant={
                            assignmentState === 'ACTIVE'
                              ? 'outline'
                              : assignmentState === 'REVOKED'
                                ? 'destructive'
                                : 'secondary'
                          }
                          className={
                            assignmentState === 'ACTIVE'
                              ? 'bg-green-50 text-green-700 border-green-200 text-xs'
                              : 'text-xs'
                          }
                          data-testid={`student-status-${student.id}`}
                        >
                          {assignmentState === 'ACTIVE'
                            ? 'Liberado'
                            : assignmentState === 'REVOKED'
                              ? 'Revogado'
                              : 'Não liberado'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLoading ? (
                          <div
                            role="status"
                            aria-label={`Atualizando acesso de ${student.name}`}
                            data-testid={`student-loading-${student.id}`}
                          >
                            <Loader2
                              className="h-4 w-4 animate-spin text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="sr-only">
                              Atualizando acesso de {student.name}
                            </span>
                          </div>
                        ) : (
                          <Switch
                            checked={assignmentState === 'ACTIVE'}
                            onCheckedChange={() =>
                              void handleToggle(student.id, student.assignment)
                            }
                            disabled={mutationPending}
                            data-testid={`student-toggle-${student.id}`}
                            aria-label={
                              assignmentState === 'ACTIVE'
                                ? `Revogar acesso de ${student.name}`
                                : assignmentState === 'REVOKED'
                                  ? `Reativar acesso para ${student.name}`
                                  : `Liberar acesso para ${student.name}`
                            }
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Página {page} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    {page > 1 && (
                      <Link
                        href={`${ROUTES.ADMIN_EXERCISES}/${exerciseId}/assignments?${new URLSearchParams({
                          ...(search ? { search } : {}),
                          page: String(page - 1),
                        }).toString()}`}
                        data-testid="pagination-prev"
                        className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-1"
                      >
                        <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                        Anterior
                      </Link>
                    )}
                    {page < totalPages && (
                      <Link
                        href={`${ROUTES.ADMIN_EXERCISES}/${exerciseId}/assignments?${new URLSearchParams({
                          ...(search ? { search } : {}),
                          page: String(page + 1),
                        }).toString()}`}
                        data-testid="pagination-next"
                        className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors flex items-center gap-1"
                      >
                        Próxima
                        <ChevronRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {confirmModal && (
        <ConfirmModal
          isOpen={true}
          onClose={() => {
            if (!mutationPending) setConfirmModal(null);
          }}
          onConfirm={
            confirmModal.type === 'grant' ? executeBulkGrant : executeBulkRevoke
          }
          title={
            confirmModal.type === 'grant'
              ? `Liberar ${confirmModal.count} alunos?`
              : `Revogar acesso de ${confirmModal.count} alunos?`
          }
          message={
            confirmModal.type === 'grant'
              ? `Os ${confirmModal.count} alunos elegíveis terão acesso a este exercício.`
              : 'As tentativas em andamento serão mantidas no histórico.'
          }
          confirmText={confirmModal.type === 'grant' ? 'Liberar' : 'Revogar'}
          dangerLevel={confirmModal.type === 'revoke' ? 'high' : 'low'}
          isLoading={bulkPending}
          confirmTestId="confirm-bulk-action"
          cancelTestId="cancel-bulk-action"
        />
      )}
    </>
  );
}
