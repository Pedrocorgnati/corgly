import { type NextRequest, NextResponse } from 'next/server'
import { cronService } from '@/services/cron.service'
import { logger } from '@/lib/logger'

type CronJob =
  | 'credit-expiration'
  | 'reminders'
  | 'auto-confirmation'
  | 'google-calendar-reconciliation'
  | 'google-calendar-channels'
const VALID_JOBS: CronJob[] = [
  'credit-expiration',
  'reminders',
  'auto-confirmation',
  'google-calendar-reconciliation',
  'google-calendar-channels',
]

/**
 * POST /api/cron
 * Endpoint unificado para disparo de cron jobs.
 * Body: { job: 'credit-expiration' | 'reminders' | 'auto-confirmation' | 'google-calendar-reconciliation' | 'google-calendar-channels' }
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
      case 'google-calendar-reconciliation':
        result = await cronService.runGoogleCalendarReconciliation()
        break
      case 'google-calendar-channels':
        result = await cronService.renewGoogleCalendarChannels()
        break
    }

    return NextResponse.json({
      success: true,
      jobRan: job,
      duration: Date.now() - start,
      result,
    })
  } catch (err) {
    const duration = Date.now() - start
    const code = (err as { code?: unknown } | null)?.code
    logger.error('[POST /api/cron] job failed', {
      action: 'cron.dispatch',
      job,
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorCode: typeof code === 'string' ? code : undefined,
    })
    return NextResponse.json({ success: false, jobRan: job, duration, error: 'Job failed' }, { status: 500 })
  }
}
