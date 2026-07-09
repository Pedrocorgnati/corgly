'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { PAGINATION } from '@/lib/constants';
import { env } from '@/lib/env';
import type { PaginatedTickets } from '@/lib/support/ticket.types';

/**
 * Server actions de Support Tickets do aluno (T-050 / suporte do aluno).
 *
 * Espelha o padrão de `actions/sessions.ts`: o fetch server-side reaproveita os
 * cookies httpOnly da requisição e fala com as rotas escopadas por aluno
 * (`/api/v1/support/tickets`), nunca expondo dados cross-aluno. A criação do
 * ticket roda no client (`new-ticket-form` via `apiClient`); aqui ficam apenas
 * as leituras consumidas pelos Server Components. Os tipos de transporte vivem
 * em `@/lib/support/ticket.types` (módulo `'use server'` só exporta funções).
 */

const API_BASE = env.NEXT_PUBLIC_APP_URL;

const EMPTY_PAGE: PaginatedTickets = {
  data: [],
  total: 0,
  page: 1,
  limit: PAGINATION.STUDENT_HISTORY,
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
 * Lista os tickets do aluno autenticado (paginado, mais recentes primeiro).
 * Em caso de falha de rede/API retorna a página vazia + a mensagem de erro,
 * para o Server Component renderizar o estado de erro sem lançar (Zero
 * Silêncio: o erro chega à UI; Zero Estados Indefinidos: sempre há um shape).
 */
export async function getSupportTickets(params?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<{ tickets: PaginatedTickets; error: string | null }> {
  const qs = new URLSearchParams();
  qs.set('page', String(params?.page ?? 1));
  qs.set('limit', String(params?.limit ?? PAGINATION.STUDENT_HISTORY));
  if (params?.status) qs.set('status', params.status);

  const result = await apiFetch<PaginatedTickets>(
    `/api/v1/support/tickets?${qs.toString()}`,
  );

  if (result.error || !result.data) {
    return { tickets: EMPTY_PAGE, error: result.error };
  }

  return { tickets: result.data, error: null };
}

/**
 * Revalida a listagem de suporte após a criação de um ticket pelo client.
 * Mantém o cache do segmento `/support` coerente com o backend sem forçar um
 * full reload no formulário.
 */
export async function revalidateSupport(): Promise<void> {
  revalidatePath('/support');
}
