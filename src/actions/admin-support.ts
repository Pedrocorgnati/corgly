'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { env } from '@/lib/env';
import type {
  PaginatedAdminTickets,
  StudentNotesPayload,
} from '@/lib/support/admin-ticket.schema';

/**
 * Server actions da visão ADMINISTRATIVA de Support Tickets (T-051).
 *
 * Espelha `actions/support.ts`: o fetch server-side reaproveita os cookies
 * httpOnly da requisição e fala com as rotas admin (`/api/v1/admin/*`), que por
 * sua vez aplicam `requireAdmin`. Aqui ficam só as LEITURAS consumidas pelos
 * Server Components admin; as escritas (responder/fechar/nota interna) rodam no
 * client via `apiClient`. Os tipos de transporte vivem em
 * `@/lib/support/admin-ticket.schema` (módulo `'use server'` só exporta funções).
 */

const API_BASE = env.NEXT_PUBLIC_APP_URL;

const EMPTY_PAGE: PaginatedAdminTickets = {
  data: [],
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 0,
};

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  const cookieStore = await cookies();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.toString(),
      ...init?.headers,
    },
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { data: null, error: json?.error ?? `Erro ${res.status}` };
  }

  return { data: (json?.data ?? null) as T, error: null };
}

/**
 * Lista os tickets (cross-aluno) para a caixa de entrada admin, aplicando os
 * filtros de status, prioridade, aluno e data. Em falha retorna página vazia +
 * a mensagem de erro (Zero Silêncio + Zero Estados Indefinidos: a UI sempre
 * recebe um shape renderizável).
 */
export async function getAdminTickets(params?: {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  studentId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ tickets: PaginatedAdminTickets; error: string | null }> {
  const qs = new URLSearchParams();
  qs.set('page', String(params?.page ?? 1));
  qs.set('limit', String(params?.limit ?? 20));
  if (params?.status) qs.set('status', params.status);
  if (params?.priority) qs.set('priority', params.priority);
  if (params?.studentId) qs.set('studentId', params.studentId);
  if (params?.search) qs.set('search', params.search);
  if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params?.dateTo) qs.set('dateTo', params.dateTo);

  const result = await apiFetch<PaginatedAdminTickets>(
    `/api/v1/admin/support/tickets?${qs.toString()}`,
  );

  if (result.error || !result.data) {
    return { tickets: EMPTY_PAGE, error: result.error };
  }

  return { tickets: result.data, error: null };
}

/**
 * Carrega as notas internas de um aluno (cross-ticket) + os tickets abertos
 * disponíveis para anexar uma nova nota.
 */
export async function getStudentNotes(
  studentId: string,
): Promise<{ payload: StudentNotesPayload | null; error: string | null }> {
  const result = await apiFetch<StudentNotesPayload>(
    `/api/v1/admin/students/${studentId}/notes`,
  );
  return { payload: result.data, error: result.error };
}

/** Revalida a caixa de entrada admin após uma ação de escrita do client. */
export async function revalidateAdminSupport(): Promise<void> {
  revalidatePath('/admin/support');
}

/** Revalida a página de notas de um aluno após registrar uma nota interna. */
export async function revalidateStudentNotes(studentId: string): Promise<void> {
  revalidatePath(`/admin/students/${studentId}/notes`);
}
