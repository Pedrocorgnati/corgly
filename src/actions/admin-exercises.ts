'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { logger } from '@/lib/logger';

import { internalApiOrigin } from '@/lib/internal-api';
import { API } from '@/lib/constants/routes';
import { exerciseItemKindSchema } from '@/lib/exercises';
import { exerciseLocaleSchema, exerciseStatusSchema } from '@/schemas/exercise.schema';

/**
 * Envelope de TODA rota /api/v1/* (`apiResponse` em src/lib/auth.ts):
 * `{ data, error, message }`. Mesma fronteira de `admin-students.ts` —
 * validar o envelope antes do payload separa "servidor respondeu outra
 * coisa" de "payload mudou de formato".
 */
const envelopeSchema = z.object({
  data: z.unknown(),
  error: z.string().nullable().optional(),
});

/** Mesma mensagem unica de contrato quebrado de students. */
const ERRO_CONTRATO = 'Resposta do servidor fora do formato esperado.';

async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  action: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: string | null }> {
  const cookieStore = await cookies();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Cookie', cookieStore.toString());

  const res = await fetch(`${await internalApiOrigin()}${path}`, {
    ...init,
    cache: 'no-store',
    headers,
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
// Contrato de GET /api/v1/admin/exercises (`exerciseService.listForAdmin`,
// item 004): `{ total, page, limit, items: AdminExerciseListRow[] }`. Date vira
// string ISO no JSON. `status` validado como enum para o badge indexar o
// EXERCISE_STATUS_MAP sem cast. Schemas privados: modulo 'use server' — so
// funcao async pode ser exportada dele.

const adminExerciseRowSchema = z.object({
  id: z.string(),
  internalTitle: z.string(),
  studentTitle: z.string().nullable(),
  predominantKind: exerciseItemKindSchema.nullable(),
  supportLanguage: exerciseLocaleSchema,
  level: z.number(),
  subject: z.string().nullable(),
  tags: z.array(z.string()),
  itemCount: z.number(),
  status: exerciseStatusSchema,
  activeAssignmentCount: z.number(),
  updatedAt: z.string().datetime(),
});

export type AdminExercise = z.infer<typeof adminExerciseRowSchema>;

const adminExercisesResponseSchema = z.object({
  items: z.array(adminExerciseRowSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export type AdminExercisesResponse = z.infer<typeof adminExercisesResponseSchema>;

const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Search params chegam como strings, enquanto chamadas internas tipadas podem
 * usar number. Nao usar `z.coerce.number()` nesta fronteira: Boolean, null e
 * arrays tambem sao coerciveis por JavaScript e nao sao filtros validos.
 */
const optionalIntegerParam = (minimum: number, maximum: number) =>
  z.preprocess(
    emptyStringToUndefined,
    z
      .union([
        z.number(),
        z.string().trim().regex(/^\d+$/).transform(Number),
      ])
      .pipe(z.number().int().min(minimum).max(maximum))
      .optional(),
  );

const adminExerciseFiltersSchema = z
  .object({
    search: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(1).max(200).optional(),
    ),
    level: optionalIntegerParam(0, 100),
    subject: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(1).max(80).optional(),
    ),
    supportLanguage: z.preprocess(emptyStringToUndefined, exerciseLocaleSchema.optional()),
    status: z.preprocess(emptyStringToUndefined, exerciseStatusSchema.optional()),
    tag: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(1).max(60).optional(),
    ),
    page: optionalIntegerParam(1, Number.MAX_SAFE_INTEGER),
    limit: optionalIntegerParam(1, 100),
  })
  .strict();

export interface AdminExerciseFilters {
  search?: string;
  level?: string | number;
  subject?: string;
  supportLanguage?: string;
  status?: string;
  tag?: string;
  page?: string | number;
  limit?: string | number;
}

const exerciseIdSchema = z.string().uuid();
const archivedExerciseSchema = z.object({
  id: z.string(),
  status: z.literal('ARCHIVED'),
});

// ── Fetchers ──

// ── Detalhe para edicao (item 007) ──
//
// Contrato de GET /api/v1/admin/exercises/[id] (`exerciseService.getForAdmin`,
// item 004): exercicio COMPLETO, com `items` incluindo `answerKey` — exatamente
// o que o aluno nunca recebe. `payload`/`answerKey` sao colunas Json validadas
// por Zod na escrita (item 002); aqui entram como unknown e o editor as trata
// por `kind`. `tags` e Json no banco: o service grava array de strings.

const adminExerciseDetailSchema = z.object({
  id: z.string(),
  internalTitle: z.string(),
  supportLanguage: z.string(),
  level: z.number(),
  subject: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  timeEstimateMin: z.number().nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  translations: z.array(
    z.object({
      locale: z.string(),
      title: z.string(),
      summary: z.string().nullable(),
    }),
  ),
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      position: z.number(),
      payload: z.unknown(),
      answerKey: z.unknown(),
      acceptWithoutAccent: z.boolean(),
      maxSeconds: z.number().nullable(),
      promptAudioAssetId: z.string().nullable(),
      answerAudioAssetId: z.string().nullable(),
      imageAssetId: z.string().nullable(),
      imageAlt: z.string().nullable(),
    }),
  ),
});

export type AdminExerciseDetail = z.infer<typeof adminExerciseDetailSchema>;

/**
 * Detalhe do admin para a tela de edicao (`/admin/exercises/[id]`, item 007).
 * Mesma fronteira de envelope que a listagem; 404 vira `{ data: null, error }`
 * e a pagina decide entre `notFound()` e tela de erro.
 */
export async function getAdminExercise(id: string) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return { data: null, error: 'Unauthorized' };
  }

  return apiFetch(API.ADMIN.EXERCISES.DETAIL(id), adminExerciseDetailSchema, 'admin.exercises.detail');
}

/**
 * Biblioteca do admin. `search` vai para a API como `q` — o nome do filtro no
 * `exerciseListQuerySchema` da rota. A busca textual do service usa
 * `{ internalTitle: { contains: q } }` SEM o mode de insensibilidade de
 * caixa: o conector MySQL do Prisma nao aceita esse campo (criterio de aceite
 * da task 006) — a insensibilidade vem da collation utf8mb4_*_ci do banco.
 */
export async function getAdminExercises(params?: AdminExerciseFilters) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return { data: null, error: 'Unauthorized' };
  }

  const parsed = adminExerciseFiltersSchema.safeParse(params ?? {});
  if (!parsed.success) {
    return { data: null, error: 'Filtros inválidos.' };
  }

  const searchParams = new URLSearchParams();
  if (parsed.data.search) searchParams.set('q', parsed.data.search);
  if (parsed.data.level !== undefined) searchParams.set('level', String(parsed.data.level));
  if (parsed.data.subject) searchParams.set('subject', parsed.data.subject);
  if (parsed.data.supportLanguage) {
    searchParams.set('supportLanguage', parsed.data.supportLanguage);
  }
  if (parsed.data.status) searchParams.set('status', parsed.data.status);
  if (parsed.data.tag) searchParams.set('tag', parsed.data.tag);
  if (parsed.data.page !== undefined) searchParams.set('page', String(parsed.data.page));
  if (parsed.data.limit !== undefined) searchParams.set('limit', String(parsed.data.limit));

  const qs = searchParams.toString();
  const path = `${API.ADMIN.EXERCISES.LIST}${qs ? `?${qs}` : ''}`;

  return apiFetch(path, adminExercisesResponseSchema, 'admin.exercises.list');
}

/** Arquiva pela API canônica, que concentra regra de domínio e auditoria. */
export async function archiveAdminExercise(exerciseId: string) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return { data: null, error: 'Unauthorized' };
  }

  const parsedId = exerciseIdSchema.safeParse(exerciseId);
  if (!parsedId.success) {
    return { data: null, error: 'Identificador de exercício inválido.' };
  }

  return apiFetch(
    API.ADMIN.EXERCISES.ARCHIVE(parsedId.data),
    archivedExerciseSchema,
    'admin.exercises.archive',
    { method: 'POST' },
  );
}

// ── Assignments (liberacoes) ──
//
// Contrato de GET /api/v1/admin/exercises/[id]/assignments (`exerciseService.listAssignments`,
// item 006): lista de assignments com status, datas e dados do aluno.
// `status` validado como enum para a UI diferenciar ACTIVE de REVOKED.

const adminAssignmentRowSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  status: z.enum(['ACTIVE', 'REVOKED']),
  grantedAt: z.string().nullable().default(null),
  revokedAt: z.string().nullable().default(null),
  firstSeenAt: z.string().nullable().default(null),
  student: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
});

export type AdminAssignment = z.infer<typeof adminAssignmentRowSchema>;

const adminAssignmentsResponseSchema = z.array(adminAssignmentRowSchema);

export type AdminAssignmentsResponse = z.infer<typeof adminAssignmentsResponseSchema>;

/**
 * Lista de liberacoes de um exercicio para o admin (`/admin/exercises/[id]/assignments`).
 * Retorna assignments com status ACTIVE ou REVOKED, dados do aluno e datas.
 */
export async function getAdminExerciseAssignments(exerciseId: string) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return { data: null, error: 'Unauthorized' };
  }

  return apiFetch(
    API.ADMIN.EXERCISES.ASSIGNMENTS(exerciseId),
    adminAssignmentsResponseSchema,
    'admin.exercises.assignments',
  );
}
