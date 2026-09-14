/**
 * GAP-04 ST002 - composicao proxy e handler na mesma requisicao autenticada.
 *
 * O teste de handler (availability-admin-handlers.test.ts) injeta a identidade
 * direto nos headers, e o proxy.test.ts mocka o JWT. Nenhum dos dois prova que o
 * que o proxy real repassa e o que o handler real precisa. Aqui a mesma
 * requisicao atravessa as duas camadas:
 *
 *  1. o JWT e assinado por `buildAuthCookie` e lido por `getPayloadFromRequest`
 *     reais (sem mock de `@/lib/auth`);
 *  2. o proxy real (`@/proxy`) decide passagem, 401 ou 403;
 *  3. a requisicao do handler leva exclusivamente os headers que o proxy
 *     repassou, lidos de `x-middleware-override-headers` e
 *     `x-middleware-request-<nome>` (gravacao em
 *     node_modules/next/dist/server/web/spec-extension/response.js:34-39).
 *
 * Todos os casos sao regressao (esperado verde no HEAD PRED 0da0f00):
 *  P1 POST admin: passagem com role ADMIN, handler 201
 *  P2 PATCH block admin: passagem, handler 200, linha bloqueada
 *  P3 PATCH unblock admin: passagem, handler 200, linha livre
 *  P4 DELETE admin: passagem, handler 204, linha removida
 *  P5 GET /api/v1/admin/availability admin: passagem, handler 200
 *  P6 quatro verbos de mutacao com cookie de aluno: passagem sem 401 nem 403,
 *     role STUDENT, handler 403, banco inalterado
 *  P7 cookie de aluno com x-user-role ADMIN e x-user-id do admin enviados pelo
 *     cliente: o proxy repassa STUDENT e o id do aluno, handler 403
 *  P8 controle sem cookie: 401 no proxy, handler nao e chamado
 *  P9 controle: cookie com version 0 e usuario com tokenVersion 1 no banco:
 *     passagem, handler 401
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { AvailabilitySlot, User } from '@prisma/client'
import { proxy } from '@/proxy'
import { POST } from '@/app/api/v1/availability/route'
import { DELETE } from '@/app/api/v1/availability/[id]/route'
import { PATCH as PATCH_BLOCK } from '@/app/api/v1/availability/[id]/block/route'
import { PATCH as PATCH_UNBLOCK } from '@/app/api/v1/availability/[id]/unblock/route'
import { GET as GET_ADMIN } from '@/app/api/v1/admin/availability/route'
import { buildAuthCookie } from '../helpers/auth.helper'
import { createTestAdmin, createTestSlot, createTestUser, getFutureDate } from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'

// O rate limit nao e objeto do teste: o mock tira a dependencia de Upstash e da
// contagem acumulada entre casos. O resto do modulo (RATE_LIMITS) e o real.
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100, resetAt: Date.now() + 60_000 }),
}))

// ── Setup ─────────────────────────────────────────────────────────────────────

const ACESSO_RESTRITO = 'Acesso restrito a administradores.'

const CORPO_POST = {
  days: [1, 3],
  ranges: [{ start: '09:00', end: '11:00' }],
  weeksAhead: 1,
  timezone: 'America/Sao_Paulo',
}

// Faixa distinta da do P1: se o 403 do aluno falhasse, a deduplicacao contra o
// banco nao mascararia a criacao na contagem.
const CORPO_POST_ALUNO = { ...CORPO_POST, ranges: [{ start: '14:00', end: '16:00' }] }

let admin: User
let aluno: User

beforeAll(async () => {
  await cleanDatabase()
  admin = await createTestAdmin()
  aluno = await createTestUser()
})

afterAll(async () => {
  await cleanDatabase()
})

beforeEach(() => {
  // proxy.ts:178 responde 503 em /api com MAINTENANCE_MODE=true.
  vi.stubEnv('MAINTENANCE_MODE', 'false')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── Travessia proxy -> handler ────────────────────────────────────────────────

interface Travessia {
  proxyRes: Response
  /** Requisicao do handler, montada so quando o proxy deixou passar. */
  handlerReq: NextRequest | null
  /** Valor que o proxy repassou ao handler para o header `nome`. */
  repassado: (nome: string) => string | null
}

async function atravessar(
  path: string,
  method: string,
  { cookie, headersDoCliente = {}, body }: { cookie?: string; headersDoCliente?: Record<string, string>; body?: unknown } = {},
): Promise<Travessia> {
  const url = `http://localhost:3000${path}`

  // Passo 1: requisicao do cliente, pelo proxy real.
  const proxyRes = await proxy(
    new NextRequest(url, {
      method,
      headers: { 'content-type': 'application/json', ...headersDoCliente, ...(cookie ? { cookie } : {}) },
    }),
  )

  const repassado = (nome: string) => proxyRes.headers.get(`x-middleware-request-${nome}`)

  // Sem `x-middleware-next` o proxy respondeu por conta propria (401, 403, 429,
  // 503) e o Next nao chamaria o handler.
  if (proxyRes.headers.get('x-middleware-next') !== '1') {
    return { proxyRes, handlerReq: null, repassado }
  }

  // Passo 2: o conjunto que o Next entrega ao handler e a lista em
  // `x-middleware-override-headers`, cada nome com o valor em
  // `x-middleware-request-<nome>`.
  const nomes = (proxyRes.headers.get('x-middleware-override-headers') ?? '').split(',').filter(Boolean)
  const headers = new Headers()
  for (const nome of nomes) {
    const valor = repassado(nome)
    if (valor !== null) headers.set(nome, valor)
  }

  // Passo 3: mesma URL, mesmo metodo, corpo JSON e somente os headers repassados.
  const handlerReq = new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  return { proxyRes, handlerReq, repassado }
}

function requisicaoDoHandler(t: Travessia): NextRequest {
  if (!t.handlerReq) {
    throw new Error(`o proxy nao deixou passar (status ${t.proxyRes.status})`)
  }
  return t.handlerReq
}

/** Segundo argumento dos handlers dinamicos do App Router. */
function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

/**
 * Slot fora da semana gerada pelo POST (weeksAhead 1): 15 dias a frente, com
 * deslocamento em horas distinto por caso, porque startAt e @unique.
 */
function slotEm(k: number, extra: { isBlocked?: boolean; blockOrigin?: 'MANUAL' | null } = {}) {
  return createTestSlot({ startAt: getFutureDate(24 * 15 + k), ...extra })
}

async function estado(id: string) {
  const slot: AvailabilitySlot | null = await testPrisma.availabilitySlot.findUnique({ where: { id } })
  return slot && { isBlocked: slot.isBlocked, blockOrigin: slot.blockOrigin, version: slot.version }
}

function diaUtc(d: Date, deltaDias: number) {
  return new Date(d.getTime() + deltaDias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Passagem do proxy: 200 de `NextResponse.next`, sem 401 e sem 403. */
function esperarPassagem(t: Travessia) {
  expect(t.proxyRes.status).toBe(200)
  expect(t.proxyRes.status).not.toBe(401)
  expect(t.proxyRes.status).not.toBe(403)
  expect(t.proxyRes.headers.get('x-middleware-next')).toBe('1')
}

// ── Mutacoes, por verbo ───────────────────────────────────────────────────────

interface Alvo {
  path: string
  body: unknown
  chamar: (req: NextRequest) => Promise<Response>
  /** Retrato do banco que a mutacao alteraria. */
  retrato: () => Promise<unknown>
}

const MUTACOES: Array<{ nome: string; metodo: string; montar: (k: number) => Promise<Alvo> }> = [
  {
    nome: 'POST /api/v1/availability',
    metodo: 'POST',
    montar: async () => ({
      path: '/api/v1/availability',
      body: CORPO_POST_ALUNO,
      chamar: (req) => POST(req),
      retrato: () => testPrisma.availabilitySlot.count(),
    }),
  },
  {
    nome: 'PATCH /api/v1/availability/[id]/block',
    metodo: 'PATCH',
    montar: async (k) => {
      const slot = await slotEm(k)
      return {
        path: `/api/v1/availability/${slot.id}/block`,
        body: {},
        chamar: (req) => PATCH_BLOCK(req, ctx(slot.id)),
        retrato: () => estado(slot.id),
      }
    },
  },
  {
    nome: 'PATCH /api/v1/availability/[id]/unblock',
    metodo: 'PATCH',
    montar: async (k) => {
      const slot = await slotEm(k, { isBlocked: true, blockOrigin: 'MANUAL' })
      return {
        path: `/api/v1/availability/${slot.id}/unblock`,
        body: {},
        chamar: (req) => PATCH_UNBLOCK(req, ctx(slot.id)),
        retrato: () => estado(slot.id),
      }
    },
  },
  {
    nome: 'DELETE /api/v1/availability/[id]',
    metodo: 'DELETE',
    montar: async (k) => {
      const slot = await slotEm(k)
      return {
        path: `/api/v1/availability/${slot.id}`,
        body: undefined,
        chamar: (req) => DELETE(req, ctx(slot.id)),
        retrato: () => estado(slot.id),
      }
    },
  },
]

// ── Admin ─────────────────────────────────────────────────────────────────────

describe('proxy real e handler real: admin (GAP-04)', () => {
  it('P1 [regressao]: POST admin passa com role ADMIN e o handler responde 201', async () => {
    const antes = await testPrisma.availabilitySlot.count()

    const t = await atravessar('/api/v1/availability', 'POST', {
      cookie: buildAuthCookie(admin.id, 'ADMIN'),
      body: CORPO_POST,
    })

    esperarPassagem(t)
    expect(t.repassado('x-user-role')).toBe('ADMIN')
    expect(t.repassado('x-user-id')).toBe(admin.id)
    expect(t.repassado('x-token-version')).toBe('0')

    const res = await POST(requisicaoDoHandler(t))
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data.created).toBeGreaterThanOrEqual(1)
    expect((await testPrisma.availabilitySlot.count()) - antes).toBe(json.data.created)
  })

  it('P2 [regressao]: PATCH block admin passa e o handler bloqueia a linha', async () => {
    const slot = await slotEm(1)

    const t = await atravessar(`/api/v1/availability/${slot.id}/block`, 'PATCH', {
      cookie: buildAuthCookie(admin.id, 'ADMIN'),
      body: {},
    })

    esperarPassagem(t)
    const res = await PATCH_BLOCK(requisicaoDoHandler(t), ctx(slot.id))
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(200)
    expect(await estado(slot.id)).toEqual({ isBlocked: true, blockOrigin: 'MANUAL', version: 1 })
  })

  it('P3 [regressao]: PATCH unblock admin passa e o handler libera a linha', async () => {
    const slot = await slotEm(2, { isBlocked: true, blockOrigin: 'MANUAL' })

    const t = await atravessar(`/api/v1/availability/${slot.id}/unblock`, 'PATCH', {
      cookie: buildAuthCookie(admin.id, 'ADMIN'),
      body: {},
    })

    esperarPassagem(t)
    const res = await PATCH_UNBLOCK(requisicaoDoHandler(t), ctx(slot.id))
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(200)
    expect(await estado(slot.id)).toEqual({ isBlocked: false, blockOrigin: null, version: slot.version + 1 })
  })

  it('P4 [regressao]: DELETE admin passa e o handler remove a linha com 204', async () => {
    const slot = await slotEm(3)

    const t = await atravessar(`/api/v1/availability/${slot.id}`, 'DELETE', {
      cookie: buildAuthCookie(admin.id, 'ADMIN'),
    })

    esperarPassagem(t)
    const res = await DELETE(requisicaoDoHandler(t), ctx(slot.id))
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(204)
    expect(await estado(slot.id)).toBeNull()
  })

  it('P5 [regressao]: GET /api/v1/admin/availability admin passa e o handler responde 200 com o slot', async () => {
    const slot = await slotEm(4)
    const date = diaUtc(slot.startAt, -1)
    const until = diaUtc(slot.startAt, 2)

    const t = await atravessar(`/api/v1/admin/availability?date=${date}&until=${until}`, 'GET', {
      cookie: buildAuthCookie(admin.id, 'ADMIN'),
    })

    esperarPassagem(t)
    expect(t.repassado('x-user-role')).toBe('ADMIN')
    const res = await GET_ADMIN(requisicaoDoHandler(t))
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.map((s: { id: string }) => s.id)).toContain(slot.id)
  })
})

// ── Aluno ─────────────────────────────────────────────────────────────────────

describe('proxy real e handler real: aluno nas mutacoes (GAP-04)', () => {
  it.each(MUTACOES.map((m, i) => ({ ...m, k: 10 + i })))(
    'P6 [regressao]: $nome com cookie de aluno passa como STUDENT e o handler responde 403',
    async ({ metodo, montar, k }) => {
      const alvo = await montar(k)
      const antes = await alvo.retrato()

      const t = await atravessar(alvo.path, metodo, {
        cookie: buildAuthCookie(aluno.id, 'STUDENT'),
        body: alvo.body,
      })

      esperarPassagem(t)
      expect(t.repassado('x-user-role')).toBe('STUDENT')
      expect(t.repassado('x-user-id')).toBe(aluno.id)

      const res = await alvo.chamar(requisicaoDoHandler(t))
      expect(res.status).not.toBe(401)
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe(ACESSO_RESTRITO)
      expect(await alvo.retrato()).toEqual(antes)
    },
  )

  it.each(MUTACOES.map((m, i) => ({ ...m, k: 20 + i })))(
    'P7 [regressao]: $nome com cookie de aluno e identidade de admin forjada pelo cliente repassa o aluno e o handler responde 403',
    async ({ metodo, montar, k }) => {
      const alvo = await montar(k)
      const antes = await alvo.retrato()

      const t = await atravessar(alvo.path, metodo, {
        cookie: buildAuthCookie(aluno.id, 'STUDENT'),
        headersDoCliente: { 'x-user-role': 'ADMIN', 'x-user-id': admin.id, 'x-token-version': '0' },
        body: alvo.body,
      })

      esperarPassagem(t)
      expect(t.repassado('x-user-role')).toBe('STUDENT')
      expect(t.repassado('x-user-id')).toBe(aluno.id)
      const req = requisicaoDoHandler(t)
      expect(req.headers.get('x-user-role')).toBe('STUDENT')
      expect(req.headers.get('x-user-id')).toBe(aluno.id)

      const res = await alvo.chamar(req)
      expect(res.status).not.toBe(401)
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe(ACESSO_RESTRITO)
      expect(await alvo.retrato()).toEqual(antes)
    },
  )
})

// ── Controles de 401 ──────────────────────────────────────────────────────────

describe('proxy real e handler real: controles de 401 (GAP-04)', () => {
  it('P8 [controle]: sem cookie o proxy responde 401 e nao deixa passar', async () => {
    const slot = await slotEm(30)

    const t = await atravessar(`/api/v1/availability/${slot.id}/block`, 'PATCH', { body: {} })

    expect(t.proxyRes.status).toBe(401)
    expect(t.proxyRes.headers.get('x-middleware-next')).toBeNull()
    expect(t.handlerReq).toBeNull()
    expect((await t.proxyRes.json()).error).toBe('Não autorizado. Faça login para continuar.')
    expect(await estado(slot.id)).toEqual({ isBlocked: false, blockOrigin: null, version: 0 })
  })

  it('P9 [controle]: cookie com version 0 e tokenVersion 1 no banco passa no proxy e o handler responde 401', async () => {
    const revogado = await createTestAdmin({
      tokenVersion: 1,
      email: `admin-revogado-gap04-p9-${Date.now()}@corgly.test`,
    })
    const slot = await slotEm(31)

    const t = await atravessar(`/api/v1/availability/${slot.id}/block`, 'PATCH', {
      cookie: buildAuthCookie(revogado.id, 'ADMIN', 0),
      body: {},
    })

    esperarPassagem(t)
    expect(t.repassado('x-token-version')).toBe('0')
    const res = await PATCH_BLOCK(requisicaoDoHandler(t), ctx(slot.id))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Sessão invalidada. Faça login novamente.')
    expect(await estado(slot.id)).toEqual({ isBlocked: false, blockOrigin: null, version: 0 })
  })
})
