'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { logger } from '@/lib/logger';

import { internalApiOrigin } from '@/lib/internal-api';

/**
 * Envelope de TODA rota /api/v1/* (`apiResponse` em src/lib/auth.ts):
 * `{ data, error, message }`. Validar o envelope antes do payload separa
 * "servidor respondeu outra coisa" de "payload mudou de formato".
 */
const envelopeSchema = z.object({
  data: z.unknown(),
  error: z.string().nullable().optional(),
});

/** Mensagem unica de contrato quebrado. NAO pode conter "404" nem "nao encontrado":
 *  `admin/students/[id]/page.tsx` usa esses termos para decidir `notFound()`. */
const ERRO_CONTRATO = 'Resposta do servidor fora do formato esperado.';

/**
 * Fronteira de dados dos fetchers de admin.
 *
 * O `json.data` que chega aqui e `unknown` de verdade: atravessou a rede e um
 * `JSON.parse`. Antes ele era devolvido com um cast (`json.data as T`), o que
 * fazia o TypeScript prometer um formato que ninguem tinha conferido — renomear
 * um campo no backend pintava a tela de vazio (ou quebrava em runtime) sem uma
 * linha de log. Agora cada fetcher passa o schema Zod do seu payload e o cast
 * some: ou o dado casa com o contrato, ou volta erro com o motivo logado.
 */
async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  action: string,
): Promise<{ data: T | null; error: string | null }> {
  const cookieStore = await cookies();
  const res = await fetch(`${await internalApiOrigin()}${path}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.toString(),
    },
  });

  let corpo: unknown;
  try {
    corpo = await res.json();
  } catch {
    logger.error('Resposta ilegivel da API interna', { action, path, status: res.status });
    return { data: null, error: `Erro ${res.status}` };
  }

  const envelope = envelopeSchema.safeParse(corpo);

  if (!res.ok) {
    const mensagem = envelope.success ? envelope.data.error : null;
    return { data: null, error: mensagem ?? `Erro ${res.status}` };
  }

  if (!envelope.success) {
    logger.error('Envelope da API interna fora do formato', {
      action,
      path,
      issues: envelope.error.issues,
    });
    return { data: null, error: ERRO_CONTRATO };
  }

  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) {
    logger.error('Contrato de dados quebrado na API interna', {
      action,
      path,
      issues: parsed.error.issues,
    });
    return { data: null, error: ERRO_CONTRATO };
  }

  return { data: parsed.data, error: null };
}

// ── Schemas e tipos ──
//
// Os tipos exportados sao DERIVADOS dos schemas (`z.infer`), nunca declarados a
// parte: tipo escrito a mao ao lado de um schema sai de sincronia em silencio.
// Os schemas ficam privados porque este modulo e 'use server' — so funcao async
// pode ser exportada dele.

const adminStudentSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  country: z.string().nullable().default(null),
  timezone: z.string().nullable().default(null),
  emailConfirmed: z.boolean(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable().default(null),
  isActive: z.boolean(),
  creditBalance: z.number(),
});

export type AdminStudent = z.infer<typeof adminStudentSchema>;

const adminStudentsResponseSchema = z.object({
  items: z.array(adminStudentSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export type AdminStudentsResponse = z.infer<typeof adminStudentsResponseSchema>;

const adminStudentDetailSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    country: z.string().nullable().default(null),
    timezone: z.string().nullable().default(null),
    emailConfirmed: z.boolean(),
    marketingOptIn: z.boolean(),
    preferredLanguage: z.string().nullable().default(null),
    onboardingCompletedAt: z.string().nullable().default(null),
    createdAt: z.string(),
    lastLoginAt: z.string().nullable().default(null),
    deletionRequestedAt: z.string().nullable().default(null),
  }),
  stats: z.object({
    creditBalance: z.number(),
    totalSessions: z.number(),
    completedSessions: z.number(),
    cancelledSessions: z.number(),
  }),
  /**
   * Lote de creditos ja normalizado pela rota (GET /api/v1/admin/users/[id]):
   * `total`/`used`/`remaining` derivam de totalCredits/usedCredits do model
   * CreditBatch, e `expired` marca lote fora da validade — que continua com
   * `remaining` > 0 ate o soft-expire do cron diario, mas nao soma no saldo.
   * Esta lista e PAGINADA; o saldo total vive em `stats.creditBalance`.
   */
  creditBatches: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      total: z.number(),
      used: z.number(),
      remaining: z.number(),
      expiresAt: z.string().nullable().default(null),
      expired: z.boolean(),
    }),
  ),
  recentSessions: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      startAt: z.string(),
      completedAt: z.string().nullable().default(null),
      hasFeedback: z.boolean(),
    }),
  ),
  /**
   * A rota manda mais campos por feedback (`scores`, `overallFeedback`) do que
   * esta tela consome; o schema fica no que a tela usa e o Zod descarta o resto.
   */
  recentFeedbacks: z.array(
    z.object({
      id: z.string(),
      sessionDate: z.string(),
      averageScore: z.number(),
      reviewed: z.boolean(),
      reviewedAt: z.string().nullable().default(null),
      createdAt: z.string(),
    }),
  ),
});

export type AdminStudentDetail = z.infer<typeof adminStudentDetailSchema>;

/**
 * Contrato REAL de GET /api/v1/admin/sessions/[id]/feedback: a rota devolve o
 * `FeedbackItem` de src/services/feedback.service.ts (mapFeedback) serializado
 * por NextResponse.json — Date vira string ISO. As dimensoes canonicas do model
 * Feedback sao listening/speaking/writing/vocabulary; o texto livre chama-se
 * `overallFeedback` (a rota admin entrega `privateNote` nele quando existe).
 * Nao existe clarity/didacticQuality/punctuality/engagement, `comment`,
 * `studentId` nem `studentName` neste payload.
 */
const sessionFeedbackDetailSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sessionDate: z.string(),
  scores: z.object({
    listening: z.number(),
    speaking: z.number(),
    writing: z.number(),
    vocabulary: z.number(),
  }),
  averageScore: z.number(),
  overallFeedback: z.string().nullable().default(null),
  listeningFeedback: z.string().nullable().default(null),
  speakingFeedback: z.string().nullable().default(null),
  writingFeedback: z.string().nullable().default(null),
  vocabularyFeedback: z.string().nullable().default(null),
  reviewed: z.boolean(),
  reviewedAt: z.string().nullable().default(null),
  adminId: z.string().nullable().default(null),
  createdAt: z.string(),
});

export type SessionFeedbackDetail = z.infer<typeof sessionFeedbackDetailSchema>;

/**
 * `feedbackService.getBySession` devolve `FeedbackItem | null`, entao 200 com
 * `data: null` significa "sessao sem feedback" — estado valido que a tela de
 * feedback renderiza como vazio. O `.nullable()` mantem esse caso passando pela
 * validacao em vez de virar erro de contrato.
 */
const sessionFeedbackDetailOrNullSchema = sessionFeedbackDetailSchema.nullable();

// ── Fetchers ──

export async function getAdminStudents(params?: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
}) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return { data: null, error: 'Unauthorized' };
  }

  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.order) searchParams.set('order', params.order);

  const qs = searchParams.toString();
  const path = `/api/v1/admin/users${qs ? `?${qs}` : ''}`;

  return apiFetch(path, adminStudentsResponseSchema, 'admin.students.list');
}

export async function getAdminStudentDetail(studentId: string) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return { data: null, error: 'Unauthorized' };
  }
  return apiFetch(
    `/api/v1/admin/users/${studentId}`,
    adminStudentDetailSchema,
    'admin.students.detail',
  );
}

export async function getSessionFeedback(sessionId: string) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return { data: null, error: 'Unauthorized' };
  }
  return apiFetch(
    `/api/v1/admin/sessions/${sessionId}/feedback`,
    sessionFeedbackDetailOrNullSchema,
    'admin.sessions.feedback',
  );
}
