'use server';
import { PAGINATION } from '@/lib/constants';
import { API } from '@/lib/constants/routes';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { SLOT_OCCUPYING_STATUSES } from '@/lib/bookings/slot-occupying-statuses';
import { internalApiOrigin } from '@/lib/internal-api';
import { logger } from '@/lib/logger';
import type { SessionWithMeta } from '@/types/session.types';

/**
 * `code` e o discriminante sem idioma do envelope (`src/lib/auth.ts`). Ate
 * 2026-09-07 quem precisava saber POR QUE a chamada falhou lia o texto de
 * `error` — classificacao que morre no instante em que a mensagem e traduzida.
 */
async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null; code: string | null }> {
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

  let json: { data?: unknown; error?: string | null; code?: string | null } | null = null;
  try {
    json = (await res.json()) as { data?: unknown; error?: string | null; code?: string | null };
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
      code: null,
    };
  }

  // O `!res.ok` fica DEPOIS da leitura de proposito: e o que preserva
  // `json.error` e `json.code`, o par que `apiResponse` embala em toda resposta
  // de erro da API. O payload tambem precisa sobreviver: conflitos 409 trazem
  // horarios alternativos acionaveis em `json.data`.
  if (!res.ok) {
    return {
      data: (json?.data ?? null) as T | null,
      error: json?.error ?? `Erro ${res.status}`,
      code: json?.code ?? null,
    };
  }

  return { data: (json?.data ?? null) as T, error: null, code: null };
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

export interface SessionConflictAlternative {
  id: string;
  startAt: string;
  endAt: string;
}

export interface SessionMutationPayload {
  alternatives?: SessionConflictAlternative[];
  [key: string]: unknown;
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

export async function bookSession(slotId: string, idempotencyKey: string) {
  const result = await apiFetch<SessionMutationPayload>('/api/v1/bookings/lock', {
    method: 'POST',
    body: JSON.stringify({ availabilitySlotId: slotId }),
    headers: { 'Idempotency-Key': idempotencyKey },
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
  const result = await apiFetch<SessionMutationPayload>(`/api/v1/sessions/${id}/reschedule`, {
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
    return { data: null, error: 'Mês inválido. Use formato YYYY-MM.', code: null };
  }

  const date = `${month}-01`;
  // Primeiro dia do mes seguinte por aritmetica de string: nao depende do fuso
  // do processo.
  const [ano, mes] = month.split('-');
  const until =
    mes === '12'
      ? `${String(Number(ano) + 1)}-01-01`
      : `${ano}-${String(Number(mes) + 1).padStart(2, '0')}-01`;

  const result = await apiFetch<
    Array<{ id: string; startAt: string; endAt: string; isBlocked: boolean }>
  >(`/api/v1/availability?date=${date}&until=${until}`);
  if (result.error || !result.data) return result;

  // Piso no agora tambem na borda que o calendario do aluno consome (item 033).
  // `getAvailable` ja corta na consulta; o corte repetido aqui usa o relogio medido
  // DEPOIS da resposta e tira o horario que passou durante a ida e volta. Instante
  // ilegivel sai da lista: horario que nao da para provar futuro nao vira clique.
  const agora = Date.now();
  return {
    ...result,
    data: result.data.filter((slot) => new Date(slot.startAt).getTime() > agora),
  };
}

/** Horario que o proprio aluno autenticado ja reservou (item 036). */
export interface OwnReservedSlot {
  /** `availabilitySlotId`: mesmo id da grade de disponibilidade. */
  id: string;
  sessionId: string;
  startAt: string;
  endAt: string;
}

/** Teto de paginas lidas por mes: 500 sessoes de um aluno num mes nao e caso real. */
const OWN_RESERVATIONS_MAX_PAGES = 5;

/**
 * Reservas do proprio aluno no mes, para a agenda identificar o horario que ele ja
 * tem (item 036).
 *
 * Le `GET /api/v1/sessions`, rota AUTENTICADA que restringe o aluno as proprias
 * sessoes; a disponibilidade publica nao ganha dado de sessao. Admin nunca chega
 * aqui: o layout `(student)` redireciona quem nao e STUDENT. "Reserva propria" usa
 * a MESMA lista fail-closed que define slot ocupado, entao sessao cancelada nao
 * aparece e status novo do enum continua contando como reserva.
 */
export async function getOwnReservedSlots(month: string) {
  // 'use server': `month` e input externo, validado antes de qualquer fetch.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { data: null, error: 'Mês inválido. Use formato YYYY-MM.', code: null };
  }

  const [ano, mes] = month.split('-');
  const until =
    mes === '12'
      ? `${String(Number(ano) + 1)}-01-01`
      : `${ano}-${String(Number(mes) + 1).padStart(2, '0')}-01`;
  // A rota aplica `to` como `lte`: um milissegundo antes do mes seguinte fecha a
  // janela meio-aberta.
  const from = `${month}-01T00:00:00.000Z`;
  const to = new Date(new Date(`${until}T00:00:00.000Z`).getTime() - 1).toISOString();

  const rows: SessionWithMeta[] = [];
  for (let page = 1; page <= OWN_RESERVATIONS_MAX_PAGES; page++) {
    const qs = new URLSearchParams({
      page: String(page),
      limit: '100',
      sort: 'startAt:asc',
      from,
      to,
    });
    const result = await apiFetch<{ data: SessionWithMeta[]; totalPages: number }>(
      `/api/v1/sessions?${qs.toString()}`,
    );
    if (result.error || !result.data) {
      return { data: null, error: result.error ?? 'Erro ao carregar reservas.', code: result.code };
    }
    rows.push(...(result.data.data ?? []));
    if (page >= (result.data.totalPages ?? 0)) break;
  }

  const agora = Date.now();
  const data: OwnReservedSlot[] = rows
    .filter(
      (row) =>
        SLOT_OCCUPYING_STATUSES.includes(row.status) &&
        new Date(row.startAt).getTime() > agora,
    )
    .map((row) => ({
      id: row.availabilitySlotId,
      sessionId: row.id,
      startAt: row.startAt,
      endAt: row.endAt,
    }));

  return { data, error: null, code: null };
}

/**
 * Visao de admin da janela: TODOS os slots do mes, inclusive bloqueados e
 * vendidos, com a sessao ocupante. Espelha `getAvailability`, trocando so a
 * rota e o tipo do payload.
 */
export async function getAdminAvailability(month: string) {
  // 'use server': `month` e input externo, validado antes de qualquer fetch.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { data: null, error: 'Mês inválido. Use formato YYYY-MM.', code: null };
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
