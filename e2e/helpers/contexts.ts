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
 * Usar fakeMicWithInput/fakeCameraWithFile para CI onde hardware de mídia não existe.
 */
export async function createDualContext(browser: Browser): Promise<DualContext> {
  const adminContext = await browser.newContext({
    permissions: ['camera', 'microphone'],
    // Simula câmera e microfone para CI (sem hardware real)
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  })

  const studentContext = await browser.newContext({
    permissions: ['camera', 'microphone'],
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
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
