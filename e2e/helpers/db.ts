import type { APIRequestContext } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET || 'dev-cron-secret'
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'dev-internal-token'

/** Reseta o banco de dados de teste (endpoint exclusivo para test env) */
export async function resetTestDb(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/test/reset-db', {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
  })
  if (!response.ok()) {
    throw new Error(`resetTestDb failed: ${response.status()} ${await response.text()}`)
  }
}

/** Cria usuário de teste via seed endpoint */
export async function createTestUser(
  request: APIRequestContext,
  params: {
    email: string
    password: string
    name: string
    role?: 'STUDENT' | 'ADMIN'
    credits?: number
    emailConfirmed?: boolean
  },
): Promise<{ id: string; email: string }> {
  const response = await request.post('/api/test/create-user', {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
    data: { ...params, role: params.role ?? 'STUDENT', emailConfirmed: params.emailConfirmed ?? true },
  })
  if (!response.ok()) {
    throw new Error(`createTestUser failed: ${response.status()} ${await response.text()}`)
  }
  return response.json()
}

/** Cria sessão com status específico para testes */
export async function seedSessionWithStatus(
  request: APIRequestContext,
  params: {
    studentId: string
    status: string
    startAt?: string
    endAt?: string
  },
): Promise<{ id: string }> {
  const now = new Date()
  const response = await request.post('/api/test/seed-session', {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
    data: {
      ...params,
      startAt: params.startAt ?? new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      endAt: params.endAt ?? new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    },
  })
  if (!response.ok()) {
    throw new Error(`seedSessionWithStatus failed: ${response.status()} ${await response.text()}`)
  }
  return response.json()
}

/* ------------------------------------------------------------------------- *
 * Fixture direta de banco (GAP-037)
 *
 * Ate aqui todo helper daqui falava com `/api/test/*`, e nenhuma dessas rotas
 * existe em `src/app/api/`: o E2E dependia de um seed que nao roda, e a spec de
 * agendamento compensava com `test.skip`. A fixture abaixo escreve direto no
 * banco de teste com o proprio Prisma, entao cada caso tem aluno, credito,
 * horario e sessao conhecidos antes de abrir o navegador.
 *
 * Guarda de banco: so `corgly_test` em host local. Sem `DATABASE_URL_TEST` o
 * helper falha alto - fixture nunca escolhe um banco por omissao, e a URL nunca
 * aparece em mensagem de erro nem em log.
 * ------------------------------------------------------------------------- */

/** Fuso das identidades de teste; o calendario do aluno e lido neste fuso. */
export const FIXTURE_TZ = 'America/Sao_Paulo'

/** Senha sintetica das identidades de teste. Nunca vai para evidencia. */
const FIXTURE_PASSWORD = 'E2eStudent@123'

export interface FixtureIdentity {
  email: string
  password: string
  name: string
  role: 'STUDENT' | 'ADMIN'
}

/**
 * Identidades estaveis compartilhadas entre specs. `TEST_USERS` (helpers/auth)
 * e a projecao deste registro; `loginAs` garante cada uma antes de navegar.
 */
export const FIXTURE_IDENTITIES: Record<string, FixtureIdentity> = {
  student: {
    email: 'e2e-student@corgly.test',
    password: FIXTURE_PASSWORD,
    name: 'Aluno E2E',
    role: 'STUDENT',
  },
  studentNoCredits: {
    email: 'e2e-student-sem-credito@corgly.test',
    password: FIXTURE_PASSWORD,
    name: 'Aluno E2E sem credito',
    role: 'STUDENT',
  },
  admin: {
    email: 'e2e-admin@corgly.test',
    password: 'E2eAdmin@123',
    name: 'Admin E2E',
    role: 'ADMIN',
  },
}

/**
 * Faixa de horario reservada por tag, em hora UTC cheia do dia seguinte.
 * Entre 12h e 17h UTC o dia civil em `FIXTURE_TZ` (UTC-3) e o mesmo do UTC, o
 * que mantem a chave do calendario previsivel sem conversao de fuso. Tag fora
 * do mapa nao ganha horario por inferencia: falha.
 */
const FIXTURE_SLOT_HOUR_UTC: Record<string, number> = {
  calendario: 12,
  slot: 13,
  'sem-credito': 14,
  historico: 15,
  fluxo: 16,
}

/** Status que NAO ocupam horario (espelho de SLOT_OCCUPYING_STATUSES por exclusao). */
const FIXTURE_FREE_STATUSES = ['CANCELLED_BY_STUDENT', 'CANCELLED_BY_ADMIN'] as const

let fixtureClient: PrismaClient | null = null

/** Valida o alvo e devolve a URL do banco de teste sem nunca imprimi-la. */
function requireTestDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL_TEST
  if (!raw) {
    throw new Error(
      'fixture E2E: DATABASE_URL_TEST ausente - rodar o E2E com o ambiente do banco de teste',
    )
  }
  const parsed = new URL(raw)
  const nome = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  if (nome !== 'corgly_test') {
    throw new Error(`fixture E2E recusada: banco alvo "${nome}" nao e corgly_test`)
  }
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error('fixture E2E recusada: host do banco de teste nao e local')
  }
  return raw
}

function fixtureDb(): PrismaClient {
  if (!fixtureClient) {
    fixtureClient = new PrismaClient({
      datasources: { db: { url: requireTestDatabaseUrl() } },
    })
  }
  return fixtureClient
}

/** Encerra a conexao da fixture (chamar no `afterAll` da spec). */
export async function disconnectFixtureDb(): Promise<void> {
  if (fixtureClient) {
    await fixtureClient.$disconnect()
    fixtureClient = null
  }
}

/** Identidade da tag: registro compartilhado quando existe, derivada quando nao. */
export function fixtureIdentity(tag: string): FixtureIdentity {
  return (
    FIXTURE_IDENTITIES[tag] ?? {
      email: `e2e-fx-${tag}@corgly.test`,
      password: FIXTURE_PASSWORD,
      name: `Aluno E2E ${tag}`,
      role: 'STUDENT',
    }
  )
}

/** Chave YYYY-MM-DD do dia civil no fuso da fixture (mesma regra do calendario). */
export function fixtureDateKey(instant: Date, timeZone: string = FIXTURE_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

function fixtureSlotStart(tag: string): Date {
  const hora = FIXTURE_SLOT_HOUR_UTC[tag]
  if (hora === undefined) {
    throw new Error(`fixture E2E: tag sem faixa de horario reservada: ${tag}`)
  }
  const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return new Date(
    Date.UTC(amanha.getUTCFullYear(), amanha.getUTCMonth(), amanha.getUTCDate(), hora, 0, 0),
  )
}

/**
 * Garante a identidade em banco (upsert por email) com login liberado: email
 * confirmado, onboarding concluido (senao o pos-login desvia para /onboarding),
 * termos aceitos e idioma fixo, para a copy assertada nao depender do
 * Accept-Language do navegador.
 */
export async function ensureIdentity(user: FixtureIdentity): Promise<{ id: string }> {
  const prisma = fixtureDb()
  const agora = new Date()
  const comum = {
    name: user.name,
    passwordHash: await bcrypt.hash(user.password, 12),
    role: user.role,
    timezone: FIXTURE_TZ,
    preferredLanguage: 'PT_BR' as const,
    emailConfirmed: true,
    onboardingCompletedAt: agora,
    termsAcceptedAt: agora,
    deletionRequestedAt: null,
  }
  const criado = await prisma.user.upsert({
    where: { email: user.email },
    update: comum,
    create: { email: user.email, ...comum },
    select: { id: true },
  })
  return { id: criado.id }
}

export interface FixtureStudent extends FixtureIdentity {
  id: string
}

/**
 * Aluno da tag com saldo exato de `credits`: zera sessoes e lotes anteriores
 * antes de recriar o lote, entao re-executar a suite nao acumula saldo nem
 * historico de execucoes passadas.
 */
export async function ensureStudent(tag: string, credits: number): Promise<FixtureStudent> {
  const prisma = fixtureDb()
  const identidade = fixtureIdentity(tag)
  const { id } = await ensureIdentity(identidade)

  await prisma.session.deleteMany({ where: { studentId: id } })
  await prisma.creditBatch.deleteMany({ where: { userId: id } })
  if (credits > 0) {
    await prisma.creditBatch.create({
      data: {
        userId: id,
        type: 'MANUAL',
        totalCredits: credits,
        usedCredits: 0,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        stripePaymentIntentId: `e2e-fixture:${identidade.email}`,
        reason: `fixture E2E ${tag}`,
      },
    })
  }
  return { ...identidade, id }
}

export interface FixtureSlot {
  id: string
  startAt: Date
  dateKey: string
}

/**
 * Horario livre e futuro da tag. A chave unica e o proprio `startAt`, entao o
 * upsert e idempotente; qualquer reserva viva herdada de execucao anterior sai
 * por cancelamento (devolver o horario, nao apagar o historico).
 */
export async function ensureFutureSlot(tag: string): Promise<FixtureSlot> {
  const prisma = fixtureDb()
  const startAt = fixtureSlotStart(tag)
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000)
  const slot = await prisma.availabilitySlot.upsert({
    where: { startAt },
    update: { endAt, isBlocked: false, blockOrigin: null },
    create: { startAt, endAt, isBlocked: false },
    select: { id: true },
  })
  await prisma.session.updateMany({
    where: {
      availabilitySlotId: slot.id,
      status: { notIn: [...FIXTURE_FREE_STATUSES] },
    },
    data: { status: 'CANCELLED_BY_STUDENT', cancelledAt: new Date(), cancelledBy: 'STUDENT' },
  })
  return { id: slot.id, startAt, dateKey: fixtureDateKey(startAt) }
}

export interface FixtureScheduledSession {
  student: FixtureStudent
  slot: FixtureSlot
  sessionId: string
}

/** Aluno da tag com uma sessao AGENDADA no horario da tag. */
export async function ensureScheduledSession(tag: string): Promise<FixtureScheduledSession> {
  const prisma = fixtureDb()
  const student = await ensureStudent(tag, 0)
  const slot = await ensureFutureSlot(tag)
  const sessao = await prisma.session.create({
    data: {
      studentId: student.id,
      availabilitySlotId: slot.id,
      startAt: slot.startAt,
      endAt: new Date(slot.startAt.getTime() + 60 * 60 * 1000),
      status: 'SCHEDULED',
    },
    select: { id: true },
  })
  return { student, slot, sessionId: sessao.id }
}

/** Sessao viva do aluno (o que o historico mostra como Agendada). */
export async function findScheduledSessionId(studentId: string): Promise<string | null> {
  const sessao = await fixtureDb().session.findFirst({
    where: { studentId, status: 'SCHEDULED' },
    orderBy: { startAt: 'asc' },
    select: { id: true },
  })
  return sessao?.id ?? null
}

/**
 * Apaga so o que a tag criou: sessoes e creditos do aluno da tag, o horario da
 * tag e, quando a identidade e derivada da tag (nao compartilhada com outras
 * specs), o proprio aluno.
 */
export async function cleanupRun(tag: string): Promise<void> {
  const prisma = fixtureDb()
  const identidade = fixtureIdentity(tag)
  const aluno = await prisma.user.findUnique({
    where: { email: identidade.email },
    select: { id: true },
  })
  if (aluno) {
    await prisma.session.deleteMany({ where: { studentId: aluno.id } })
    await prisma.creditBatch.deleteMany({ where: { userId: aluno.id } })
  }
  if (FIXTURE_SLOT_HOUR_UTC[tag] !== undefined) {
    const startAt = fixtureSlotStart(tag)
    const slot = await prisma.availabilitySlot.findUnique({
      where: { startAt },
      select: { id: true },
    })
    if (slot) {
      await prisma.session.deleteMany({ where: { availabilitySlotId: slot.id } })
      await prisma.availabilitySlot.delete({ where: { id: slot.id } })
    }
  }
  if (aluno && !FIXTURE_IDENTITIES[tag]) {
    await prisma.user.delete({ where: { id: aluno.id } })
  }
}

/** Dispara cron job via endpoint interno */
export async function triggerCronJob(
  request: APIRequestContext,
  job: 'credit-expiration' | 'reminders' | 'auto-confirmation',
): Promise<{ success: boolean; jobRan: string; duration: number }> {
  const response = await request.post('/api/cron', {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
    data: { job },
  })
  if (!response.ok()) {
    throw new Error(`triggerCronJob(${job}) failed: ${response.status()} ${await response.text()}`)
  }
  return response.json()
}
