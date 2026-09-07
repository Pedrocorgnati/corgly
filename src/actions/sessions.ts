'use server';
import { PAGINATION } from '@/lib/constants';
import { API } from '@/lib/constants/routes';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { internalApiOrigin } from '@/lib/internal-api';
import { logger } from '@/lib/logger';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  const cookieStore = await cookies();
  const res = await fetch(`${await internalApiOrigin()}${path}`, {
    ...init,
    cache: init?.method && init.method !== 'GET' ? undefined : 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.toString(),
      ...init?.headers,
    },
  });

  let json: { data?: unknown; error?: string | null } | null = null;
  try {
    json = (await res.json()) as { data?: unknown; error?: string | null };
  } catch (parseError) {
    // Corpo ilegivel: 405 sem corpo, HTML de gateway (502/504 do proxy),
    // resposta truncada. `apiFetch` devolve par em TODO caminho -- quem chama
    // le `{ data, error }`, nunca um throw.
    // O 3o argumento de `logger.error(message, context?, error?)` preserva o
    // stack do SyntaxError -- sem ele o log do 502/504-HTML fica sem causa.
    logger.error(
      'Resposta ilegivel da API interna',
      {
        action: 'actions.sessions.apiFetch',
        path,
        status: res.status,
      },
      parseError,
    );
    return {
      data: null,
      error: res.ok ? 'Resposta ilegível do servidor.' : `Erro ${res.status}`,
    };
  }

  // O `!res.ok` fica DEPOIS da leitura de proposito: e o que preserva
  // `json.error`, a mensagem que `apiResponse` embala em toda resposta de erro
  // da API e que `BookingConfirmModal` le para entrar em `insufficient_credits`.
  if (!res.ok) {
    return { data: null, error: json?.error ?? `Erro ${res.status}` };
  }

  return { data: (json?.data ?? null) as T, error: null };
}

/**
 * Linha de sessao como as telas de listagem consomem.
 *
 * O payload de `GET /api/v1/sessions` e `SessionWithMeta` (src/types/session.types.ts),
 * que NAO carrega `studentName`, `adminName` nem `score`. Por isso esses tres campos
 * sao opcionais aqui: a listagem tolera a ausencia e renderiza placeholder. Tipar
 * `data` como `unknown[]` obrigava cada page a um cast implicito que o tsc reprovava.
 */
export interface SessionListRow {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  studentName?: string;
  adminName?: string;
  score?: number | null;
}

export interface PaginatedSessionList {
  data: SessionListRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getSessions(params?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<PaginatedSessionList> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);

  const result = await apiFetch<PaginatedSessionList>(
    `/api/v1/sessions?${qs.toString()}`,
  );

  return result.data ?? { data: [], total: 0, page: 1, limit: PAGINATION.DEFAULT, totalPages: 0 };
}

export async function getSession(id: string) {
  return apiFetch(`/api/v1/sessions/${id}`);
}

export async function bookSession(slotId: string) {
  const result = await apiFetch('/api/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({ availabilitySlotId: slotId }),
  });

  if (!result.error) {
    revalidatePath('/schedule');
    revalidatePath('/history');
    revalidatePath('/admin/sessions');
  }

  return result;
}

export async function cancelSession(id: string, reason?: string) {
  const result = await apiFetch(`/api/v1/sessions/${id}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });

  if (!result.error) {
    revalidatePath('/history');
    revalidatePath('/schedule');
    revalidatePath('/admin/sessions');
  }

  return result;
}

export async function rescheduleSession(id: string, newSlotId: string) {
  const result = await apiFetch(`/api/v1/sessions/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify({ newAvailabilitySlotId: newSlotId }),
  });

  if (!result.error) {
    revalidatePath('/history');
    revalidatePath('/schedule');
    revalidatePath('/admin/sessions');
  }

  return result;
}


export async function getAvailability(month: string) {
  // 'use server': `month` e input externo, validado antes de qualquer fetch.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { data: null, error: 'Mês inválido. Use formato YYYY-MM.' };
  }

  const date = `${month}-01`;
  // Primeiro dia do mes seguinte por aritmetica de string: nao depende do fuso
  // do processo.
  const [ano, mes] = month.split('-');
  const until =
    mes === '12'
      ? `${String(Number(ano) + 1)}-01-01`
      : `${ano}-${String(Number(mes) + 1).padStart(2, '0')}-01`;

  return apiFetch<Array<{ id: string; startAt: string; endAt: string; isBlocked: boolean }>>(
    `/api/v1/availability?date=${date}&until=${until}`,
  );
}

/**
 * Visao de admin da janela: TODOS os slots do mes, inclusive bloqueados e
 * vendidos, com a sessao ocupante. Espelha `getAvailability`, trocando so a
 * rota e o tipo do payload.
 */
export async function getAdminAvailability(month: string) {
  // 'use server': `month` e input externo, validado antes de qualquer fetch.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { data: null, error: 'Mês inválido. Use formato YYYY-MM.' };
  }

  const date = `${month}-01`;
  // Primeiro dia do mes seguinte por aritmetica de string: nao depende do fuso
  // do processo.
  const [ano, mes] = month.split('-');
  const until =
    mes === '12'
      ? `${String(Number(ano) + 1)}-01-01`
      : `${ano}-${String(Number(mes) + 1).padStart(2, '0')}-01`;

  return apiFetch<
    Array<{
      id: string;
      startAt: string;
      endAt: string;
      isBlocked: boolean;
      session: { id: string; status: string; studentName?: string } | null;
    }>
  >(`${API.ADMIN.AVAILABILITY}?date=${date}&until=${until}`);
}
