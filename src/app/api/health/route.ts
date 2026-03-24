import { prisma } from '@/lib/prisma'

/**
 * GET /api/health
 * Endpoint público de health check.
 * Não expõe dados sensíveis (connection strings, stack traces, tokens).
 * Usado por: PM2 health monitor, UptimeRobot, smoke tests pós-deploy.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()

  let dbStatus: 'ok' | 'error' = 'ok'

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
  } catch {
    dbStatus = 'error'
  }

  const latency = Date.now() - start
  const isHealthy = dbStatus === 'ok'

  return Response.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      db: dbStatus,
      timestamp: new Date().toISOString(),
      latency,
    },
    {
      status: isHealthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, no-cache' },
    },
  )
}
