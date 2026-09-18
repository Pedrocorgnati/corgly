import type { Page } from '@playwright/test'

import { FIXTURE_IDENTITIES, ensureIdentity, type FixtureIdentity } from './db'

export type TestUser = FixtureIdentity

/**
 * Identidades de teste. Antes o comentario dizia "pre-criadas via seed", mas o
 * seed era um wrapper para `/api/test/*`, rota que nao existe no produto: em
 * banco limpo o login falhava. Agora a projecao vem do registro de fixture e
 * quem cria a identidade e o proprio `loginAs`.
 */
export const TEST_USERS: Record<string, TestUser> = {
  student: FIXTURE_IDENTITIES.student,
  studentNoCredits: FIXTURE_IDENTITIES.studentNoCredits,
  admin: FIXTURE_IDENTITIES.admin,
}

/** Faz login via UI e aguarda redirecionamento para /dashboard */
export async function loginAs(page: Page, user: TestUser): Promise<void> {
  await ensureIdentity(user)
  await page.goto('/auth/login')
  await page.locator('input[type="email"]').fill(user.email)
  await page.locator('input[type="password"]').fill(user.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 15_000 })
}

/** Faz logout via API (mais rápido que UI) */
export async function logout(page: Page): Promise<void> {
  await page.goto('/api/v1/auth/logout', { waitUntil: 'domcontentloaded' })
}

/** Gera email único para testes de registro */
export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}-${Date.now()}@corgly.test`
}
