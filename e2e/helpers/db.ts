import type { APIRequestContext } from '@playwright/test'

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
