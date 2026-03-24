import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna 200 com status healthy quando DB está online', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '1': 1 }])

    // Importa o handler dinamicamente para usar mocks
    const { GET } = await import('@/app/api/health/route')
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('healthy')
    expect(body.db).toBe('ok')
    expect(typeof body.timestamp).toBe('string')
    expect(typeof body.latency).toBe('number')
  })

  it('retorna 503 com status degraded quando DB está offline', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('Connection refused'))

    const { GET } = await import('@/app/api/health/route')
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.db).toBe('error')
    // Não expõe a mensagem de erro do Prisma
    expect(body.error).toBeUndefined()
  })

  it('retorna 503 quando DB timeout (> 5s)', async () => {
    vi.useFakeTimers()

    vi.mocked(prisma.$queryRaw).mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
    )

    const { GET } = await import('@/app/api/health/route')
    const responsePromise = GET()

    // Avança 6 segundos para triggar o timeout interno de 5s
    vi.advanceTimersByTime(6000)

    const response = await responsePromise
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.db).toBe('error')

    vi.useRealTimers()
  })

  it('não expõe stack trace ou connection string na resposta de erro', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(
      new Error('mysql://user:password@localhost:3306/corgly -- connection refused'),
    )

    const { GET } = await import('@/app/api/health/route')
    const response = await GET()
    const body = await response.json()

    const responseText = JSON.stringify(body)
    expect(responseText).not.toContain('mysql://')
    expect(responseText).not.toContain('password')
    expect(responseText).not.toContain('connection refused')
  })
})
