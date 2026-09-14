/**
 * GAP-07 (item 018) - validacao da migration da linha `timezone` em MySQL.
 *
 * O teste unitario `src/__tests__/lib/app-settings-timezone-migration.test.ts`
 * trava a forma do SQL. Esta suite prova o comportamento no banco de TESTE:
 * aplicar a migration duas vezes deixa uma linha so, e reaplicar nunca
 * sobrescreve valor ja gravado pelo admin.
 *
 * `cleanDatabase` nao trunca `app_settings`: a linha anterior e guardada no
 * `beforeAll` e restaurada (ou apagada, se nao havia) no `afterAll`.
 * A suite nao cria slot, entao `startAt @unique` nao se aplica.
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, cleanDatabase } from '../setup'

const CHAVE = 'timezone'
// Valor gravado pela migration (decisao ST002 = 1).
const FUSO_DA_MIGRATION = 'America/Sao_Paulo'
const MIGRATIONS = path.resolve(process.cwd(), 'prisma/migrations')
const PADRAO_PASTA = /^\d{14}_canonical_timezone_setting_row$/

type LinhaAnterior = { value: string; updatedAt: Date } | null

/**
 * Le o SQL da pasta criada no ST003 e devolve os comandos, um por chamada de
 * `$executeRawUnsafe` (o driver prepara um comando por vez). Linhas de
 * comentario `--` saem antes do split.
 */
function comandosDaMigration(): string[] {
  const pastas = fs.readdirSync(MIGRATIONS).filter((nome) => PADRAO_PASTA.test(nome))
  expect(pastas).toHaveLength(1)
  const sql = fs.readFileSync(path.join(MIGRATIONS, pastas[0], 'migration.sql'), 'utf8')
  const comandos = sql
    .split('\n')
    .filter((linha) => !/^\s*--/.test(linha))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((comando) => comando.trim())
    .filter((comando) => comando.length > 0)
  expect(comandos.length).toBeGreaterThan(0)
  return comandos
}

async function aplicarMigration(comandos: string[]): Promise<void> {
  for (const comando of comandos) {
    await testPrisma.$executeRawUnsafe(comando)
  }
}

describe('migration da linha timezone em app_settings no banco de teste (GAP-07)', () => {
  let anterior: LinhaAnterior = null

  beforeAll(async () => {
    const linha = await testPrisma.appSetting.findUnique({ where: { key: CHAVE } })
    anterior = linha ? { value: linha.value, updatedAt: linha.updatedAt } : null
  })

  afterAll(async () => {
    if (anterior) {
      await testPrisma.appSetting.upsert({
        where: { key: CHAVE },
        create: { key: CHAVE, value: anterior.value, updatedAt: anterior.updatedAt },
        update: { value: anterior.value, updatedAt: anterior.updatedAt },
      })
    } else {
      await testPrisma.appSetting.deleteMany({ where: { key: CHAVE } })
    }
    await cleanDatabase()
  })

  it('VALIDACAO 018: aplicar duas vezes deixa uma linha', async () => {
    const comandos = comandosDaMigration()
    // Parte do banco sem a linha, como um ambiente antes do deploy da migration.
    await testPrisma.appSetting.deleteMany({ where: { key: CHAVE } })

    await aplicarMigration(comandos)
    await aplicarMigration(comandos)

    expect(await testPrisma.appSetting.count({ where: { key: CHAVE } })).toBe(1)
    const linha = await testPrisma.appSetting.findUnique({ where: { key: CHAVE } })
    expect(linha?.value).toBe(FUSO_DA_MIGRATION)
  })

  it('VALIDACAO 018: reaplicar nao sobrescreve valor gravado', async () => {
    const comandos = comandosDaMigration()
    await testPrisma.appSetting.upsert({
      where: { key: CHAVE },
      create: { key: CHAVE, value: 'Asia/Tokyo' },
      update: { value: 'Asia/Tokyo' },
    })

    await aplicarMigration(comandos)

    expect(await testPrisma.appSetting.count({ where: { key: CHAVE } })).toBe(1)
    const linha = await testPrisma.appSetting.findUnique({ where: { key: CHAVE } })
    expect(linha?.value).toBe('Asia/Tokyo')
  })
})
