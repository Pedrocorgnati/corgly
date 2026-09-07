import type { Browser, BrowserContext, Page } from '@playwright/test'
import { loginAs, TEST_USERS } from './auth'

export interface DualContext {
  adminContext: BrowserContext
  studentContext: BrowserContext
  adminPage: Page
  studentPage: Page
  cleanup: () => Promise<void>
}

/**
 * Cria dois contextos de browser isolados para testes WebRTC (E2E-005, E2E-007).
 *
 * Cada contexto tem cookies/storage independentes — necessário para simular
 * dois usuários diferentes conectados ao mesmo tempo.
 *
 * Câmera e microfone falsos (CI sem hardware de mídia) NÃO se configuram aqui:
 * `--use-fake-ui-for-media-stream` / `--use-fake-device-for-media-stream` são
 * flags de LINHA DE COMANDO do Chromium e valem no launch do browser, não no
 * contexto. Elas vivem em `playwright.config.ts` (`use.launchOptions.args`).
 * Passá-las para `newContext()` era ruído: o Playwright ignora a chave em
 * runtime — os contextos rodavam com o hardware real da máquina — e o
 * `tsc` reprovava com TS2353 ('args' não existe em BrowserContextOptions).
 */
export async function createDualContext(browser: Browser): Promise<DualContext> {
  const adminContext = await browser.newContext({
    permissions: ['camera', 'microphone'],
  })

  const studentContext = await browser.newContext({
    permissions: ['camera', 'microphone'],
  })

  const adminPage = await adminContext.newPage()
  const studentPage = await studentContext.newPage()

  return {
    adminContext,
    studentContext,
    adminPage,
    studentPage,
    cleanup: async () => {
      await adminContext.close()
      await studentContext.close()
    },
  }
}

/**
 * Cria dois contextos já autenticados (admin + student).
 */
export async function createAuthenticatedDualContext(browser: Browser): Promise<DualContext> {
  const dual = await createDualContext(browser)

  await loginAs(dual.adminPage, TEST_USERS.admin)
  await loginAs(dual.studentPage, TEST_USERS.student)

  return dual
}
