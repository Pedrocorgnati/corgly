import type { Page } from '@playwright/test'

export interface TestUser {
  email: string
  password: string
  name: string
  role: 'STUDENT' | 'ADMIN'
}

/** Usuários de teste pré-criados via seed */
export const TEST_USERS: Record<string, TestUser> = {
  student: {
    email: 'e2e-student@corgly.test',
    password: 'E2eStudent@123',
    name: 'Aluno E2E',
    role: 'STUDENT',
  },
  admin: {
    email: 'e2e-admin@corgly.test',
    password: 'E2eAdmin@123',
    name: 'Admin E2E',
    role: 'ADMIN',
  },
}

/** Faz login via UI e aguarda redirecionamento para /dashboard */
export async function loginAs(page: Page, user: TestUser): Promise<void> {
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
