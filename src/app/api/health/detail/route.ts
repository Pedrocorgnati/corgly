import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-guard'
import { UserRole } from '@/lib/constants/enums'

/**
 * GET /api/health/detail
 * Endpoint interno com status detalhado de todos os subsistemas.
 * Requer: X-Internal-Token header OU cookie JWT com role=ADMIN.
 * NÃO expor publicamente.
 */
export const dynamic = 'force-dynamic'

async function checkDb(): Promise<{ status: 'ok' | 'error'; latencyMs: number }> {
  const start = Date.now()
  try {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), 5000)
        timeoutId.unref?.()
      }),
    ]).finally(() => {
      if (timeoutId !== null) clearTimeout(timeoutId)
    })
    return { status: 'ok', latencyMs: Date.now() - start }
  } catch {
    return { status: 'error', latencyMs: Date.now() - start }
  }
}

async function checkHocuspocus(): Promise<{ status: 'ok' | 'error'; port: number }> {
  const port = Number(process.env.HOCUSPOCUS_PORT) || 1234

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ status: 'error', port }), 3000)

    try {
      const ws = new (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket(
        `ws://localhost:${port}`,
      )
      ws.onopen = () => {
        clearTimeout(timeout)
        ws.close()
        resolve({ status: 'ok', port })
      }
      ws.onerror = () => {
        clearTimeout(timeout)
        resolve({ status: 'error', port })
      }
    } catch {
      clearTimeout(timeout)
      resolve({ status: 'error', port })
    }
  })
}

export async function GET(request: NextRequest) {
  // Autenticação: X-Internal-Token OU JWT admin
  const internalToken = request.headers.get('x-internal-token')
  const expectedToken = process.env.INTERNAL_TOKEN

  const isInternalToken = internalToken && expectedToken && internalToken === expectedToken

  if (!isInternalToken) {
    // Tenta autenticação via JWT (requireAuth verifica headers injetados pelo middleware)
    const authResult = await requireAuth(request)
    if (authResult instanceof Response) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (authResult.role !== UserRole.ADMIN) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const [dbCheck, hocuspocusCheck] = await Promise.allSettled([
    checkDb(),
    checkHocuspocus(),
  ])

  const db = dbCheck.status === 'fulfilled' ? dbCheck.value : { status: 'error' as const, latencyMs: 0 }
  const hocuspocus = hocuspocusCheck.status === 'fulfilled'
    ? hocuspocusCheck.value
    : { status: 'error' as const, port: 1234 }

  // Email check (simples — verifica que env var está configurada)
  const emailStatus: 'ok' | 'error' = process.env.RESEND_API_KEY ? 'ok' : 'error'
  const stripeStatus: 'ok' | 'error' = process.env.STRIPE_SECRET_KEY ? 'ok' : 'error'

  const checks = {
    db,
    email: { status: emailStatus, provider: 'resend' },
    stripe: { status: stripeStatus },
    hocuspocus,
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok')
  const anyError = Object.values(checks).some((c) => c.status === 'error')

  const overallStatus = allOk ? 'healthy' : anyError ? 'degraded' : 'healthy'

  return Response.json(
    {
      status: overallStatus,
      checks,
      version: process.env.npm_package_version ?? '0.1.0',
      environment: process.env.NODE_ENV,
      uptime: process.uptime(),
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store, no-cache' },
    },
  )
}
