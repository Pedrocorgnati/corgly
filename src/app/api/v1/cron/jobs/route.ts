import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { runJobRunner, summarizeError } from '@/lib/jobs/job-runner';

/**
 * GET /api/v1/cron/jobs
 * Dispara o runner assíncrono de jobs (T-056, PRD §13.6).
 * Agendado via vercel.json (ex.: a cada minuto). Protegido por CRON_SECRET.
 *
 * Aceita `?queue=` para drenar uma fila específica (default `default`) e
 * `?max=` para limitar o lote por invocação (default 25). O runner aplica lock
 * e retry; este endpoint apenas autentica o cron e devolve o resumo.
 *
 * Status codes: 401 secret ausente/incorreto, 500 erro interno.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const queueName = url.searchParams.get('queue')?.trim() || 'default';
  const maxParam = Number.parseInt(url.searchParams.get('max') ?? '', 10);
  const maxJobs = Number.isFinite(maxParam) && maxParam > 0 ? Math.min(maxParam, 100) : 25;

  try {
    const summary = await runJobRunner({ queueName, maxJobs });
    return NextResponse.json(summary);
  } catch (err) {
    // Erro redigido antes de logar: nunca passar o objeto bruto ao logger
    // (acceptance T-056: falhas registram erro resumido sem vazar segredo).
    const { code, message } = summarizeError(err);
    logger.error('cron.jobs.failed', {
      action: 'cron_jobs_failed',
      errorCode: code,
      errorMessage: message,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
