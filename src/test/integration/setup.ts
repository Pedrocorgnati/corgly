/**
 * Setup global para testes de integração.
 *
 * Responsabilidades:
 * - Conectar ao banco de teste (DATABASE_URL_TEST)
 * - Limpar tabelas após cada suite (afterAll por arquivo)
 * - Desconectar ao final de todos os testes
 */

import { PrismaClient } from '@prisma/client'
import { beforeAll, afterAll } from 'vitest'

// ── Garantir que estamos usando banco de teste ────────────────────────────────

const testDbUrl = process.env.DATABASE_URL_TEST

if (!testDbUrl) {
  throw new Error(
    '[integration] DATABASE_URL_TEST não configurado.\n' +
    'Configure no .env.test: DATABASE_URL_TEST=mysql://user:pass@localhost:3306/corgly_test',
  )
}

// Sobrescreve DATABASE_URL para que @/lib/prisma use o banco de teste
process.env.DATABASE_URL = testDbUrl

// ── Prisma Client compartilhado nos testes ────────────────────────────────────

export const testPrisma = new PrismaClient({
  datasources: { db: { url: testDbUrl } },
  log: process.env.DEBUG_SQL === 'true' ? ['query', 'error'] : ['error'],
})

// ── Hooks globais ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  await testPrisma.$connect()
})

afterAll(async () => {
  await testPrisma.$disconnect()
})

// ── Helper de limpeza ─────────────────────────────────────────────────────────

/**
 * Limpa todas as tabelas na ordem correta (FK reversa).
 * Chamar em afterAll de cada suite de testes.
 */
export async function cleanDatabase(): Promise<void> {
  // Desabilita FK checks para truncate rápido (MySQL)
  await testPrisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')

  const tables = [
    'feedbacks',
    'session_documents',
    'sessions',
    'credit_batches',
    'payments',
    'subscriptions',
    'recurring_patterns',
    'cookie_consents',
    'availability_slots',
    'contents',
    'users',
  ]

  for (const table of tables) {
    await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``)
  }

  await testPrisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1')
}
