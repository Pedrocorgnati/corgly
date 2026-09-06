'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { internalApiOrigin } from '@/lib/internal-api';

// ── Fronteira API/UI ─────────────────────────────────────────────────────────
//
// Mesma regra de src/actions/dashboard.ts: nenhum dado chega na UI sem schema.
// O `json.data as T` que existia aqui declarava um vocabulario de notas
// (clarity/didactics/punctuality/engagement) que o backend nunca emitiu.

/** Envelope de toda rota /api/v1/*. Produtor: `apiResponse` em src/lib/auth.ts. */
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
    console.error('[actions/progress] falha de rede', { path, cause });
    return { data: null, error: 'Não foi possível falar com o servidor. Tente de novo.' };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (cause) {
    console.error('[actions/progress] resposta não é JSON', { path, status: res.status, cause });
    return { data: null, error: `Resposta inválida do servidor (HTTP ${res.status}).` };
  }

  const envelope = apiEnvelopeSchema.safeParse(payload);

  if (!res.ok) {
    const serverError = (envelope.success ? envelope.data.error : null) ?? null;
    console.error('[actions/progress] endpoint respondeu erro', {
      path,
      status: res.status,
      serverError,
    });
    return { data: null, error: serverError ?? `Erro ${res.status}` };
  }

  if (!envelope.success) {
    console.error('[actions/progress] envelope fora do contrato', {
      path,
      status: res.status,
      issues: envelope.error.issues,
    });
    return { data: null, error: 'Resposta do servidor fora do formato esperado.' };
  }

  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) {
    console.error('[actions/progress] contrato de dados quebrado', {
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
 * Notas por dimensao. Vocabulario canonico do backend:
 * prisma/schema.prisma (listeningScore/speakingScore/writingScore/vocabularyScore),
 * src/schemas/feedback.schema.ts e src/services/feedback.service.ts.
 * Sao medias (float) e valem 0 quando ainda nao ha feedback.
 */
const feedbackScoresSchema = z.object({
  listening: z.number(),
  speaking: z.number(),
  writing: z.number(),
  vocabulary: z.number(),
});

export type FeedbackScores = z.infer<typeof feedbackScoresSchema>;

/** Produtor: GET /api/v1/feedback/progress -> `ProgressData` (src/services/feedback.service.ts). */
const progressDataSchema = z.object({
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

export type ProgressData = z.infer<typeof progressDataSchema>;

/**
 * Item do historico. Produtor: GET /api/v1/feedback/history -> `FeedbackItem`
 * (src/services/feedback.service.ts). O texto livre se chama `overallFeedback`
 * — `comment` nao existe em lugar nenhum do backend.
 * Validamos o recorte consumido pela pagina; o produtor entrega tambem os
 * feedbacks por dimensao, `reviewed`, `reviewedAt`, `adminId` e `createdAt`.
 */
const feedbackHistoryItemSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sessionDate: isoDateTime,
  scores: feedbackScoresSchema,
  averageScore: z.number(),
  overallFeedback: z.string().nullable(),
});

export type FeedbackHistoryItem = z.infer<typeof feedbackHistoryItemSchema>;

const feedbackHistoryResultSchema = z.object({
  items: z.array(feedbackHistoryItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export type FeedbackHistoryResult = z.infer<typeof feedbackHistoryResultSchema>;

// ── Fetchers ─────────────────────────────────────────────────────────────────

export async function getProgressData(): Promise<ActionResult<ProgressData>> {
  return apiFetch('/api/v1/feedback/progress', progressDataSchema);
}

export async function getFeedbackHistory(
  page = 1,
  period: '30d' | '90d' | 'all' = 'all',
): Promise<ActionResult<FeedbackHistoryResult>> {
  // Produtor destes parametros: src/app/api/v1/feedback/history/route.ts (GET).
  const query = new URLSearchParams({ page: String(page), limit: '20', period });
  return apiFetch(`/api/v1/feedback/history?${query.toString()}`, feedbackHistoryResultSchema);
}
