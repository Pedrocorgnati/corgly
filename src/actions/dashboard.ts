'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { SessionStatus } from '@/lib/constants/enums';
import { getAuthUser, type AuthUser } from '@/lib/data/auth';
import { internalApiOrigin } from '@/lib/internal-api';
import type { SessionWithMeta } from '@/types/session.types';


// ── Fronteira API/UI ─────────────────────────────────────────────────────────
//
// Regra desta camada: nada entra na UI sem passar por um schema Zod. Antes daqui
// existia um `json.data as T` que declarava um shape que a API nunca entregou
// (scheduledAt/durationMinutes/clarity...). Cast nao valida nada — schema valida.
//
// Contrato de falha (Zero Silencio + Zero Estados Indefinidos):
//   - rede caiu, JSON invalido, HTTP != 2xx ou shape fora do contrato
//     => `data: null` + `error` legivel + console.error com contexto (path/status/issues).
//   - o consumidor nunca recebe um objeto meia-boca; recebe null e sabe por que.

/**
 * Envelope de toda rota /api/v1/*. Produtor: `apiResponse` em src/lib/auth.ts.
 * `data` fica `unknown` de proposito — quem valida o miolo e o schema do endpoint.
 */
const apiEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  error: z.string().nullish(),
  message: z.string().nullish(),
});

/** Datas trafegam sempre como ISO 8601 UTC (Date.toISOString via NextResponse.json). */
const isoDateTime = z.string().datetime();

export interface ActionResult<T> {
  data: T | null;
  error: string | null;
}

async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
): Promise<ActionResult<z.infer<S>>> {
  const cookieStore = await cookies();

  let res: Response;
  try {
    res = await fetch(`${await internalApiOrigin()}${path}`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieStore.toString(),
      },
    });
  } catch (cause) {
    console.error('[actions/dashboard] falha de rede', { path, cause });
    return { data: null, error: 'Não foi possível falar com o servidor. Tente de novo.' };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (cause) {
    console.error('[actions/dashboard] resposta não é JSON', { path, status: res.status, cause });
    return { data: null, error: `Resposta inválida do servidor (HTTP ${res.status}).` };
  }

  const envelope = apiEnvelopeSchema.safeParse(payload);

  if (!res.ok) {
    const serverError = (envelope.success ? envelope.data.error : null) ?? null;
    console.error('[actions/dashboard] endpoint respondeu erro', {
      path,
      status: res.status,
      serverError,
    });
    return { data: null, error: serverError ?? `Erro ${res.status}` };
  }

  if (!envelope.success) {
    console.error('[actions/dashboard] envelope fora do contrato', {
      path,
      status: res.status,
      issues: envelope.error.issues,
    });
    return { data: null, error: 'Resposta do servidor fora do formato esperado.' };
  }

  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) {
    console.error('[actions/dashboard] contrato de dados quebrado', {
      path,
      status: res.status,
      issues: parsed.error.issues,
    });
    return { data: null, error: 'Resposta do servidor fora do formato esperado.' };
  }

  return { data: parsed.data, error: null };
}

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Usuario do dashboard. Produtor: `getAuthUser` (src/lib/data/auth.ts), que le
 * GET /api/v1/auth/me. Reexportamos o tipo do produtor em vez de redeclarar —
 * duas declaracoes do mesmo shape sempre derivam uma da outra.
 */
export type DashboardUser = AuthUser;

/**
 * Saldo + lotes de credito. Produtor: GET /api/v1/credits, que devolve
 * `{ balance, breakdown }` com `breakdown` = `BreakdownItem[]`
 * (src/services/credit.service.ts). `expiresAt` e NULAVEL: lote de assinatura
 * nao expira e o servico devolve null.
 * Validamos apenas o recorte consumido pelo dashboard; o produtor entrega mais
 * campos (type, totalCredits, usedCredits, createdAt) e o schema os descarta.
 */
const dashboardCreditsSchema = z.object({
  balance: z.number(),
  breakdown: z.array(
    z.object({
      id: z.string(),
      remaining: z.number(),
      expiresAt: isoDateTime.nullable(),
    }),
  ),
});

export type DashboardCredits = z.infer<typeof dashboardCreditsSchema>;

/**
 * Proxima aula. Recorte FIEL de `SessionWithMeta` (src/types/session.types.ts),
 * que e o que `sessionToMeta` (src/services/session.service.ts) serializa.
 * O campo canonico e `startAt` em ISO — `scheduledAt` e `durationMinutes` nunca
 * existiram na resposta da API; a duracao se calcula com `endAt - startAt`.
 */
export type DashboardNextSession = Pick<SessionWithMeta, 'id' | 'startAt' | 'endAt' | 'status'>;

/** Pagina de sessoes: GET /api/v1/sessions devolve `PaginatedSessions` no envelope. */
export interface DashboardSessionsPage {
  data: DashboardNextSession[];
  total: number;
}

const dashboardSessionsPageSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      startAt: isoDateTime,
      endAt: isoDateTime,
      status: z.enum(SessionStatus),
    }),
  ),
  total: z.number(),
});

/**
 * Notas por dimensao. Vocabulario canonico do backend:
 * prisma/schema.prisma (listeningScore/speakingScore/writingScore/vocabularyScore),
 * src/schemas/feedback.schema.ts e src/services/feedback.service.ts.
 * Sao medias (float), nao inteiros — e valem 0 quando ainda nao ha feedback.
 */
const feedbackScoresSchema = z.object({
  listening: z.number(),
  speaking: z.number(),
  writing: z.number(),
  vocabulary: z.number(),
});

export type FeedbackScores = z.infer<typeof feedbackScoresSchema>;

/** Produtor: GET /api/v1/feedback/progress -> `ProgressData` (src/services/feedback.service.ts). */
const dashboardProgressSchema = z.object({
  averageScores: feedbackScoresSchema,
  totalSessions: z.number(),
  completedSessions: z.number(),
  trend: z.enum(['improving', 'stable', 'declining']),
  lastFeedbacks: z.array(
    z.object({
      id: z.string(),
      sessionId: z.string(),
      sessionDate: isoDateTime,
      averageScore: z.number(),
      scores: feedbackScoresSchema,
    }),
  ),
});

export type DashboardProgress = z.infer<typeof dashboardProgressSchema>;

/** Produtor: GET /api/v1/feedback -> `FeedbackListResult` (src/services/feedback.service.ts). */
const dashboardRecentFeedbacksSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      sessionId: z.string(),
      sessionDate: isoDateTime,
      averageScore: z.number(),
    }),
  ),
  total: z.number(),
});

export type DashboardRecentFeedbacks = z.infer<typeof dashboardRecentFeedbacksSchema>;

// ── Fetchers ─────────────────────────────────────────────────────────────────

export async function getDashboardUser(): Promise<ActionResult<DashboardUser>> {
  // Usa React.cache() — deduplicado com o getAuthUser() do layout no mesmo render.
  const user = await getAuthUser();
  if (!user) {
    return { data: null, error: 'Não autenticado' };
  }
  return { data: user, error: null };
}

export async function getDashboardCredits(): Promise<ActionResult<DashboardCredits>> {
  return apiFetch('/api/v1/credits', dashboardCreditsSchema);
}

export async function getDashboardNextSession(): Promise<ActionResult<DashboardSessionsPage>> {
  // Produtor destes parametros: src/app/api/v1/sessions/route.ts (GET).
  //   - `from` (ISO): a rota ja repassa para SessionService.listByStudent, que filtra
  //     startAt >= from. Manda o agora para nunca trazer aula que ja passou.
  //   - `sort=startAt:asc`: honrado pela rota (parseSessionSort/SESSION_SORTS em
  //     src/services/session.service.ts). Sem ele o default e startAt desc e o
  //     `limit=1` devolveria a aula futura MAIS DISTANTE, nao a proxima.
  const query = new URLSearchParams({
    status: SessionStatus.SCHEDULED,
    limit: '1',
    sort: 'startAt:asc',
    from: new Date().toISOString(),
  });

  return apiFetch(`/api/v1/sessions?${query.toString()}`, dashboardSessionsPageSchema);
}

export async function getDashboardProgress(): Promise<ActionResult<DashboardProgress>> {
  return apiFetch('/api/v1/feedback/progress', dashboardProgressSchema);
}

export async function getDashboardRecentFeedbacks(): Promise<
  ActionResult<DashboardRecentFeedbacks>
> {
  return apiFetch('/api/v1/feedback?limit=3', dashboardRecentFeedbacksSchema);
}
