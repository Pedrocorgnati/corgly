/**
 * TASK-9 ST001 — Integration test: signaling flow
 * Testa o fluxo completo de signaling entre dois peers usando o SignalingService diretamente.
 *
 * `SignalingService` e assincrono ponta a ponta (Promise em storeSignal,
 * getSignals e clearSignals) e todos os consumidores de producao ja o tratam
 * assim: `src/app/api/v1/sessions/[id]/signal/route.ts:67,155`,
 * `src/app/api/v1/sessions/[id]/interrupt/route.ts:65` e
 * `src/lib/sessions/realtime-signaling.service.ts:199,216` usam `await`.
 * Este arquivo era o unico lugar que ainda chamava o servico como se fosse
 * sincrono, e por isso media Promise em vez de signal.
 *
 * Sem UPSTASH_REDIS_REST_URL/TOKEN no ambiente de teste, o servico cai no
 * fallback in-memory — que e o alvo do primeiro bloco. O segundo bloco monta um
 * Redis falso para cobrir o caminho distribuido (o que roda na Vercel).
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import { SignalingService } from '@/services/signaling.service'
import type { SessionSignal } from '@/types/sala-virtual'

/**
 * Redis falso com a semantica das operacoes usadas pelo servico (lista por
 * chave). Registra a ordem das chamadas para que o teste possa afirmar QUE
 * comandos o consumo emite, nao so o resultado.
 */
const fake = vi.hoisted(() => {
  const lists = new Map<string, string[]>()
  const calls: string[] = []
  let afterLpop: (() => void) | null = null

  const listOf = (key: string) => lists.get(key) ?? []
  const save = (key: string, values: string[]) => {
    if (values.length === 0) lists.delete(key)
    else lists.set(key, values)
  }

  class FakePipeline {
    private ops: Array<() => void> = []

    lpush(key: string, ...values: string[]) {
      calls.push('lpush')
      // Semantica real do LPUSH: cada valor entra na cabeca, um a um, entao a
      // lista final fica com os argumentos em ordem invertida.
      this.ops.push(() => save(key, [...[...values].reverse(), ...listOf(key)]))
      return this
    }

    rpush(key: string, ...values: string[]) {
      calls.push('rpush')
      this.ops.push(() => save(key, [...listOf(key), ...values]))
      return this
    }

    ltrim(key: string, start: number, stop: number) {
      calls.push('ltrim')
      this.ops.push(() => {
        const current = listOf(key)
        const from = start < 0 ? Math.max(current.length + start, 0) : start
        const to = stop < 0 ? current.length + stop : Math.min(stop, current.length - 1)
        save(key, current.slice(from, to + 1))
      })
      return this
    }

    expire(_key: string, _seconds: number) {
      calls.push('expire')
      return this
    }

    async exec() {
      calls.push('exec')
      const ops = this.ops
      this.ops = []
      for (const op of ops) op()
      return []
    }
  }

  class FakeRedis {
    multi() {
      calls.push('multi')
      return new FakePipeline()
    }

    async lpop<TData>(key: string, count: number): Promise<TData | null> {
      calls.push('lpop')
      const current = [...listOf(key)]
      const taken = current.splice(0, count)
      save(key, current)
      const hook = afterLpop
      afterLpop = null
      hook?.()
      return (taken.length === 0 ? null : taken) as TData | null
    }

    async lrange(key: string, _start: number, _stop: number): Promise<string[]> {
      calls.push('lrange')
      return [...listOf(key)]
    }

    async rpush(key: string, ...values: string[]): Promise<number> {
      calls.push('rpush')
      save(key, [...listOf(key), ...values])
      return listOf(key).length
    }

    async expire(_key: string, _seconds: number): Promise<number> {
      calls.push('expire')
      return 1
    }

    async del(...keys: string[]): Promise<number> {
      calls.push('del')
      let removed = 0
      for (const key of keys) if (lists.delete(key)) removed += 1
      return removed
    }

    async scan(_cursor: number, opts: { match: string; count: number }): Promise<[number, string[]]> {
      calls.push('scan')
      const prefix = opts.match.replace(/\*$/, '')
      return [0, [...lists.keys()].filter((key) => key.startsWith(prefix))]
    }
  }

  return {
    lists,
    calls,
    FakeRedis,
    onceAfterLpop(fn: () => void) {
      afterLpop = fn
    },
    reset() {
      lists.clear()
      calls.length = 0
      afterLpop = null
    },
  }
})

vi.mock('@upstash/redis', () => ({ Redis: fake.FakeRedis }))

const SESSION_ID = 'session-abc-123'
const SESSION_2 = 'session-xyz-456'
const USER_A = 'student-001' // Peer A (student)
const USER_B = 'admin-peer' // Peer B (admin/teacher)

const mockOffer: RTCSdpInit = { type: 'offer', sdp: 'v=0\r\no=...' }
const mockAnswer: RTCSdpInit = { type: 'answer', sdp: 'v=0\r\na=...' }
const mockCandidate: RTCIceCandidateInit = {
  candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 54321 typ host',
  sdpMid: '0',
  sdpMLineIndex: 0,
}

describe('Signaling Flow Integration', () => {
  let service: SignalingService

  beforeEach(async () => {
    service = new SignalingService()
    // O fallback in-memory vive em um Map de modulo, compartilhado por toda
    // instancia de SignalingService: sem esta limpeza o signal retido por um
    // teste (o que usa `after`) vaza para o proximo.
    await service.clearSignals(SESSION_ID)
    await service.clearSignals(SESSION_2)
  })

  it('peer A cria offer -> peer B recebe via GET -> peer B cria answer -> peer A recebe', async () => {
    // 1. Peer A: POST offer (armazena para peer B)
    const offerSignal: SessionSignal = {
      type: 'offer',
      payload: mockOffer,
      from: USER_A,
      timestamp: new Date().toISOString(),
    }
    await service.storeSignal(SESSION_ID, USER_B, offerSignal)

    // 2. Peer B: GET signals -> recebe offer de peer A
    const signalsForB = await service.getSignals(SESSION_ID, USER_B, USER_B)
    expect(signalsForB).toHaveLength(1)
    expect(signalsForB[0]).toMatchObject({
      type: 'offer',
      from: USER_A,
    })
    expect(signalsForB[0].payload).toEqual(mockOffer)

    // 3. Peer B: POST answer (armazena para peer A)
    const answerSignal: SessionSignal = {
      type: 'answer',
      payload: mockAnswer,
      from: USER_B,
      timestamp: new Date().toISOString(),
    }
    await service.storeSignal(SESSION_ID, USER_A, answerSignal)

    // 4. Peer A: GET signals -> recebe answer de peer B
    const signalsForA = await service.getSignals(SESSION_ID, USER_A, USER_A)
    expect(signalsForA).toHaveLength(1)
    expect(signalsForA[0]).toMatchObject({
      type: 'answer',
      from: USER_B,
    })
    expect(signalsForA[0].payload).toEqual(mockAnswer)
  })

  it('consome a fila: o mesmo signal nao volta no poll seguinte', async () => {
    await service.storeSignal(SESSION_ID, USER_B, {
      type: 'offer',
      payload: mockOffer,
      from: USER_A,
      timestamp: new Date().toISOString(),
    })

    expect(await service.getSignals(SESSION_ID, USER_B, USER_B)).toHaveLength(1)
    expect(await service.getSignals(SESSION_ID, USER_B, USER_B)).toHaveLength(0)
  })

  it('ICE candidates sao trocados corretamente', async () => {
    // Peer A envia candidate para peer B
    const candidateFromA: SessionSignal = {
      type: 'candidate',
      payload: mockCandidate,
      from: USER_A,
      timestamp: new Date().toISOString(),
    }
    await service.storeSignal(SESSION_ID, USER_B, candidateFromA)

    // Peer B envia candidate para peer A
    const candidateFromB: SessionSignal = {
      type: 'candidate',
      payload: { ...mockCandidate, candidate: 'candidate:2 1 udp 2130706431 10.0.0.1 12345 typ host' },
      from: USER_B,
      timestamp: new Date().toISOString(),
    }
    await service.storeSignal(SESSION_ID, USER_A, candidateFromB)

    // Peer B recebe candidate de A
    const forB = await service.getSignals(SESSION_ID, USER_B, USER_B)
    expect(forB).toHaveLength(1)
    expect(forB[0].type).toBe('candidate')
    expect(forB[0].from).toBe(USER_A)

    // Peer A recebe candidate de B
    const forA = await service.getSignals(SESSION_ID, USER_A, USER_A)
    expect(forA).toHaveLength(1)
    expect(forA[0].type).toBe('candidate')
    expect(forA[0].from).toBe(USER_B)
  })

  it('after parameter filtra signals corretamente (nao repete)', async () => {
    const ts1 = '2026-03-21T10:00:00.000Z'
    const ts2 = '2026-03-21T10:00:01.000Z'
    const ts3 = '2026-03-21T10:00:02.000Z'

    // Armazenar 3 signals com timestamps diferentes
    await service.storeSignal(SESSION_ID, USER_B, {
      type: 'offer',
      payload: mockOffer,
      from: USER_A,
      timestamp: ts1,
    })
    await service.storeSignal(SESSION_ID, USER_B, {
      type: 'candidate',
      payload: mockCandidate,
      from: USER_A,
      timestamp: ts2,
    })
    await service.storeSignal(SESSION_ID, USER_B, {
      type: 'candidate',
      payload: mockCandidate,
      from: USER_A,
      timestamp: ts3,
    })

    // GET com after=ts1 -> retorna apenas signals após ts1 (ts2, ts3)
    const filtered = await service.getSignals(SESSION_ID, USER_B, USER_B, ts1)
    expect(filtered).toHaveLength(2)
    expect(filtered[0].timestamp).toBe(ts2)
    expect(filtered[1].timestamp).toBe(ts3)
  })

  it('signals de sessao diferente nao vazam entre rooms', async () => {
    await service.storeSignal(SESSION_ID, USER_B, {
      type: 'offer',
      payload: mockOffer,
      from: USER_A,
      timestamp: new Date().toISOString(),
    })
    await service.storeSignal(SESSION_2, USER_B, {
      type: 'offer',
      payload: mockAnswer,
      from: 'other-student',
      timestamp: new Date().toISOString(),
    })

    // Peer B da sessao 1 recebe apenas signals da sessao 1
    const forSession1 = await service.getSignals(SESSION_ID, USER_B, USER_B)
    expect(forSession1).toHaveLength(1)
    expect(forSession1[0].from).toBe(USER_A)

    // Peer B da sessao 2 recebe apenas signals da sessao 2
    const forSession2 = await service.getSignals(SESSION_2, USER_B, USER_B)
    expect(forSession2).toHaveLength(1)
    expect(forSession2[0].from).toBe('other-student')
  })

  it('clearSignals remove todos signals de uma sessao', async () => {
    await service.storeSignal(SESSION_ID, USER_B, {
      type: 'offer',
      payload: mockOffer,
      from: USER_A,
      timestamp: new Date().toISOString(),
    })
    await service.storeSignal(SESSION_ID, USER_A, {
      type: 'answer',
      payload: mockAnswer,
      from: USER_B,
      timestamp: new Date().toISOString(),
    })

    await service.clearSignals(SESSION_ID)

    const forB = await service.getSignals(SESSION_ID, USER_B, USER_B)
    const forA = await service.getSignals(SESSION_ID, USER_A, USER_A)
    expect(forB).toHaveLength(0)
    expect(forA).toHaveLength(0)
  })
})

describe('Signaling Flow Integration (Redis, caminho de producao)', () => {
  let RedisSignalingService: typeof SignalingService
  let service: SignalingService

  const ts1 = '2026-03-21T10:00:00.000Z'
  const ts2 = '2026-03-21T10:00:01.000Z'
  const ts3 = '2026-03-21T10:00:02.000Z'

  const mailbox = () => `@corgly/sig:${SESSION_ID}:${USER_B}`

  const rawSignal = (timestamp: string, expiresAt: number) =>
    JSON.stringify({
      type: 'candidate',
      payload: mockCandidate,
      from: USER_A,
      timestamp,
      expiresAt,
    })

  beforeAll(async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fake.upstash.local')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fake-token')
    vi.resetModules()
    const mod = await import('@/services/signaling.service')
    RedisSignalingService = mod.SignalingService
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  beforeEach(() => {
    fake.reset()
    service = new RedisSignalingService()
  })

  /**
   * DEFESA: escrever signal e UMA transacao. Em RPUSH/LTRIM/EXPIRE soltos, uma
   * falha no meio deixa a fila sem cap ou a chave sem TTL.
   */
  it('storeSignal grava RPUSH + LTRIM + EXPIRE dentro de um MULTI', async () => {
    await service.storeSignal(SESSION_ID, USER_B, {
      type: 'offer',
      payload: mockOffer,
      from: USER_A,
      timestamp: ts1,
    })

    expect(fake.calls).toEqual(['multi', 'rpush', 'ltrim', 'expire', 'exec'])
    expect(fake.lists.get(mailbox())).toHaveLength(1)
  })

  /**
   * DEFESA: o consumo drena com LPOP atomico e nunca DELeta a fila. Com
   * LRANGE + DEL, o signal que o peer publicasse entre a leitura e a reescrita
   * era apagado sem nunca ter sido entregue — ICE candidate perdido e conexao
   * que nao fecha.
   */
  it('nao perde signal publicado pelo peer durante o consumo', async () => {
    const valid = Date.now() + 60 * 60 * 1000
    fake.lists.set(mailbox(), [rawSignal(ts1, valid), rawSignal(ts2, valid)])
    fake.calls.length = 0

    // O peer publica ts3 exatamente entre o drain e a reescrita dos retidos.
    fake.onceAfterLpop(() => {
      const key = mailbox()
      fake.lists.set(key, [...(fake.lists.get(key) ?? []), rawSignal(ts3, valid)])
    })

    const first = await service.getSignals(SESSION_ID, USER_B, USER_B, ts1)
    expect(first.map((s) => s.timestamp)).toEqual([ts2])
    expect(fake.calls).not.toContain('del')

    const second = await service.getSignals(SESSION_ID, USER_B, USER_B, ts2)
    expect(second.map((s) => s.timestamp)).toEqual([ts3])
  })

  /**
   * DEFESA: signal expirado morre no consumo. Antes ele voltava para a fila com
   * EXPIRE renovado a cada poll, entao a chave nunca morria.
   */
  it('nao devolve signal expirado para a fila', async () => {
    const expirado = Date.now() - 1
    const valido = Date.now() + 60 * 60 * 1000
    fake.lists.set(mailbox(), [rawSignal(ts1, expirado), rawSignal(ts2, valido)])
    fake.calls.length = 0

    const entregues = await service.getSignals(SESSION_ID, USER_B, USER_B, ts1)

    expect(entregues.map((s) => s.timestamp)).toEqual([ts2])
    expect(fake.lists.get(mailbox()) ?? []).toEqual([])
  })

  it('retem em ordem cronologica o que o cliente ainda nao pediu', async () => {
    const valido = Date.now() + 60 * 60 * 1000
    fake.lists.set(mailbox(), [rawSignal(ts1, valido), rawSignal(ts2, valido), rawSignal(ts3, valido)])

    const entregues = await service.getSignals(SESSION_ID, USER_B, USER_B, ts2)
    expect(entregues.map((s) => s.timestamp)).toEqual([ts3])

    const retidos = (fake.lists.get(mailbox()) ?? []).map(
      (item) => (JSON.parse(item) as { timestamp: string }).timestamp,
    )
    expect(retidos).toEqual([ts1, ts2])
  })
})
