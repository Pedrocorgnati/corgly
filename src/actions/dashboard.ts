'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { BOOKING_RULES } from '@/lib/constants';
import { SessionStatus } from '@/lib/constants/enums';
import { getAuthUser, type AuthUser } from '@/lib/data/auth';
import { internalApiOrigin } from '@/lib/internal-api';
import type { SessionWithMeta } from '@/types/session.types';

/**
 * Status em que a aula ainda esta viva na agenda do aluno.
 *
 * `SCHEDULED` = marcada e ninguem entrou; `IN_PROGRESS` = alguem entrou na sala
 * (PATCH /api/v1/sessions/[id]). Mesmo vocabulario de `ACTIVE_SESSION_STATUSES`
 * em src/services/session.service.ts, que e quem decide se a aula pode ser
 * cancelada/iniciada.
 */
const ACTIVE_SESSION_STATUSES = [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS] as const;

/**
 * Quanto olhar para TRAS ao procurar a aula corrente.
 *
 * A rota filtra `startAt >= from`, nunca `endAt`. Para a aula em andamento
 * continuar aparecendo, `from` precisa recuar pelo maximo que uma aula pode
 * durar: os 55 min de `BOOKING_RULES.SESSION_DURATION_MINUTES` mais os 60 min de
 * extensao que `SessionService.extendSession` pode somar ao `endAt` (teto
 * validado em src/app/api/v1/sessions/[id]/route.ts). Quem de fato descarta a
 * aula ja encerrada e o filtro por `endAt`; esta janela so garante que ela
 * chegue ate la.
 */
const MAX_SESSION_EXTENSION_MINUTES = 60;
const ONGOING_LOOKBACK_MS =
  (BOOKING_RULES.SESSION_DURATION_MINUTES + MAX_SESSION_EXTENSION_MINUTES) * 60 * 1000;

/**
 * Quantas aulas pedir por status. `limit: 1` nao serve: a primeira da janela
 * pode ser uma aula que ja terminou e continuou `SCHEDULED` (ninguem entrou),
 * e ela roubaria a vaga da aula real. Em 115 minutos nao cabem mais do que tres
 * aulas de 55 min sem sobreposicao — 5 e folga.
 */
const ONGOING_CANDIDATE_LIMIT = 5;


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

/**
 * Resultado do card "Proxima aula".
 *
 * Embrulhado num objeto de proposito: `ActionResult.data === null` significa
 * FALHA. Se o fetcher devolvesse a sessao nua, "nao ha aula" e "nao consegui
 * saber" colapsariam no mesmo `null` e o card voltaria a mentir "voce nao tem
 * aulas agendadas" quando a API caiu.
 */
export interface DashboardNextSessionResult {
  /** Aula em andamento ou a proxima agendada. `null` = agenda vazia (fato). */
  session: DashboardNextSession | null;
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

/**
 * Proxima aula do aluno — INCLUINDO a que ja comecou e ainda nao terminou.
 *
 * Por que nao basta `status=SCHEDULED&from=<agora>`: a rota filtra
 * `startAt >= from` (src/services/session.service.ts, `listByStudent`), entao no
 * minuto em que a aula COMECA ela sai do filtro e o card esvazia — some com o
 * botao "Entrar" exatamente quando o aluno precisa dele. Alem disso o status
 * vira `IN_PROGRESS` assim que alguem entra na sala
 * (PATCH /api/v1/sessions/[id]), e um filtro so de `SCHEDULED` perderia a aula
 * de novo.
 *
 * Estrategia:
 *   1. Olha para tras `ONGOING_LOOKBACK_MS` (duracao maxima possivel de uma
 *      aula), para que a aula em andamento ainda entre no `startAt >= from`.
 *   2. Pergunta uma vez por status vivo — a rota aceita UM `status` por
 *      requisicao, e listar sem status traria canceladas/concluidas ocupando o
 *      `limit` (aluno que remarca o mesmo horario acumula CANCELLED_BY_STUDENT).
 *   3. Descarta o que ja acabou por `endAt <= agora` (a aula que passou nao pode
 *      reaparecer) e fica com o menor `startAt`.
 */
export async function getDashboardNextSession(): Promise<
  ActionResult<DashboardNextSessionResult>
> {
  const agoraMs = Date.now();
  const from = new Date(agoraMs - ONGOING_LOOKBACK_MS).toISOString();

  // `sort=startAt:asc` e honrado pela rota (parseSessionSort/SESSION_SORTS).
  // Sem ele o default e `startAt:desc` e o recorte traria as aulas mais
  // distantes da janela em vez das mais proximas.
  const respostas = await Promise.all(
    ACTIVE_SESSION_STATUSES.map((status) => {
      const query = new URLSearchParams({
        status,
        limit: String(ONGOING_CANDIDATE_LIMIT),
        sort: 'startAt:asc',
        from,
      });
      return apiFetch(`/api/v1/sessions?${query.toString()}`, dashboardSessionsPageSchema);
    }),
  );

  // Zero Silencio: uma perna que falhou pode ser justamente a que tinha a aula.
  // Reportar erro e melhor do que devolver "sem aula agendada" por omissao.
  const falha = respostas.find((resposta) => resposta.error !== null);
  if (falha?.error) {
    return { data: null, error: falha.error };
  }

  const candidatas = respostas
    .flatMap((resposta) => resposta.data?.data ?? [])
    .filter((sessao) => {
      const fimMs = Date.parse(sessao.endAt);
      return Number.isFinite(fimMs) && fimMs > agoraMs;
    })
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  return { data: { session: candidatas[0] ?? null }, error: null };
}

export async function getDashboardProgress(): Promise<ActionResult<DashboardProgress>> {
  return apiFetch('/api/v1/feedback/progress', dashboardProgressSchema);
}

export async function getDashboardRecentFeedbacks(): Promise<
  ActionResult<DashboardRecentFeedbacks>
> {
  return apiFetch('/api/v1/feedback?limit=3', dashboardRecentFeedbacksSchema);
}
