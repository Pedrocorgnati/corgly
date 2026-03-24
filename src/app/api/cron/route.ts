import { type NextRequest, NextResponse } from 'next/server'
import { cronService } from '@/services/cron.service'

type CronJob = 'credit-expiration' | 'reminders' | 'auto-confirmation'
const VALID_JOBS: CronJob[] = ['credit-expiration', 'reminders', 'auto-confirmation']

/**
 * POST /api/cron
 * Endpoint unificado para disparo de cron jobs.
 * Body: { job: 'credit-expiration' | 'reminders' | 'auto-confirmation' }
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Usado por: PM2 scripts/trigger-cron.js e testes E2E (E2E-008).
 */
export async function POST(request: NextRequest) {
  // Autenticação via CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { job?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { job } = body

  if (!job || !VALID_JOBS.includes(job as CronJob)) {
    return NextResponse.json(
      { error: 'Invalid job name', validJobs: VALID_JOBS },
      { status: 400 },
    )
  }

  const start = Date.now()

  try {
    let result: unknown

    switch (job as CronJob) {
      case 'credit-expiration':
        result = await cronService.runCreditExpiration()
        break
      case 'reminders':
        result = await cronService.runReminders()
        break
      case 'auto-confirmation':
        result = await cronService.runAutoConfirmation()
        break
    }

    return NextResponse.json({
      success: true,
      jobRan: job,
      duration: Date.now() - start,
      result,
    })
  } catch (err) {
    console.error(`[POST /api/cron] Job "${job}" failed:`, err)
    return NextResponse.json(
      {
        success: false,
        jobRan: job,
        duration: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
