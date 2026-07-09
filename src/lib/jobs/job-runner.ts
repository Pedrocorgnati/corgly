import 'server-only';
import { randomUUID } from 'node:crypto';

import type { Job } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { claimNextJob, updateJobStatus } from './job.service';
import type { JobType } from './job.schema';

/**
 * Runner assíncrono de jobs (T-056, PRD §13.6).
 *
 * Processa jobs pendentes (`QUEUED`) por fila com lock cooperativo e retry com
 * backoff exponencial. O lock é adquirido por `claimNextJob`, que transita o job
 * para `RUNNING`, incrementa `attempts` e grava `lockedBy`/`lockedAt` de forma
 * atômica, evitando que dois workers processem o mesmo job.
 *
 * Handlers são registrados por `JobType` via `registerJobHandler` (transcrição,
 * exportação DSR, exports de relatório etc.). O runner em si não conhece a
 * semântica de cada tipo; apenas orquestra claim -> handler -> transição final.
 *
 * Falhas NUNCA vazam segredo: `summarizeError` redige tokens, e-mails e strings
 * com aparência de credencial antes de persistir `finalErrorMessage`.
 */

/** Handler de um tipo de job. Lança em caso de falha; retorno void = sucesso. */
export type JobHandler = (job: Job) => Promise<void>;

const handlers = new Map<JobType, JobHandler>();

/** Registra (ou sobrescreve) o handler de um tipo de job. */
export function registerJobHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

/** Resolve o handler de um tipo de job, se registrado. */
export function getJobHandler(type: JobType): JobHandler | undefined {
  return handlers.get(type);
}

/** Remove todos os handlers registrados (uso em testes). */
export function clearJobHandlers(): void {
  handlers.clear();
}

export interface RunnerOptions {
  /** Fila a drenar. Default: `default`. */
  queueName?: string;
  /** Identificador do worker (lock owner). Default: `runner-{uuid}`. */
  workerId?: string;
  /** Máximo de jobs processados nesta invocação. Default: 10. */
  maxJobs?: number;
  /** Backoff base em ms para retry. Default: 30_000 (30s). */
  backoffBaseMs?: number;
  /** Backoff máximo em ms. Default: 1_800_000 (30min). */
  backoffMaxMs?: number;
  /** Injeção de relógio (testes). Default: `() => new Date()`. */
  now?: () => Date;
}

export type JobOutcome = 'SUCCEEDED' | 'FAILED' | 'REQUEUED' | 'NO_HANDLER';

export interface JobOutcomeDetail {
  id: string;
  type: JobType;
  outcome: JobOutcome;
  attempts: number;
  errorCode?: string;
}

export interface RunnerSummary {
  queueName: string;
  workerId: string;
  claimed: number;
  succeeded: number;
  failed: number;
  requeued: number;
  noHandler: number;
  details: JobOutcomeDetail[];
}

const DEFAULT_BACKOFF_BASE_MS = 30_000;
const DEFAULT_BACKOFF_MAX_MS = 30 * 60_000;
const ERROR_MESSAGE_MAX = 280;

/**
 * Redige segredos de uma string antes de persistir/logar.
 * Cobre: chaves Stripe/secret, Bearer tokens, JWTs, e-mails e blobs longos com
 * cara de credencial. Ordem importa: padrões específicos antes do genérico.
 */
function redactSecrets(input: string): string {
  return input
    .replace(/\b(sk|pk|rk|whsec|ak)_[a-z]+_[A-Za-z0-9]+/gi, '[REDACTED_KEY]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9._-]{10,}/g, '[REDACTED_JWT]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]');
}

/**
 * Converte qualquer erro num par `{ code, message }` seguro para persistência.
 * A mensagem é redigida (sem segredo) e truncada; o code é estável e curto.
 */
export function summarizeError(err: unknown, maxLen: number = ERROR_MESSAGE_MAX): {
  code: string;
  message: string;
} {
  let code = 'JOB_HANDLER_ERROR';
  let raw: string;

  if (err instanceof Error) {
    code = err.name && err.name !== 'Error' ? err.name.slice(0, 80) : code;
    raw = err.message || err.name || 'Erro desconhecido';
  } else if (typeof err === 'string') {
    raw = err;
  } else {
    try {
      raw = JSON.stringify(err);
    } catch {
      raw = 'Erro não serializável';
    }
  }

  const safe = redactSecrets(raw).trim().slice(0, maxLen) || 'Erro desconhecido';
  return { code, message: safe };
}

/** Backoff exponencial limitado pelo teto configurado. */
function backoffMs(attempts: number, baseMs: number, maxMs: number): number {
  const exp = Math.max(0, attempts - 1);
  return Math.min(baseMs * 2 ** exp, maxMs);
}

/**
 * Drena uma fila: reivindica jobs pendentes, executa o handler do tipo e aplica
 * a transição final (sucesso, retry com backoff ou falha terminal).
 *
 * Idempotência operacional: cada job só é processado por quem detém o lock
 * (`claimNextJob`); reexecutar o runner em paralelo é seguro.
 */
export async function runJobRunner(options: RunnerOptions = {}): Promise<RunnerSummary> {
  const queueName = options.queueName ?? 'default';
  const workerId = options.workerId ?? `runner-${randomUUID()}`;
  const maxJobs = Math.max(1, options.maxJobs ?? 10);
  const baseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const maxMs = options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
  const now = options.now ?? (() => new Date());

  const summary: RunnerSummary = {
    queueName,
    workerId,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    requeued: 0,
    noHandler: 0,
    details: [],
  };

  for (let i = 0; i < maxJobs; i += 1) {
    const job = await claimNextJob(queueName, workerId);
    if (!job) {
      break;
    }
    summary.claimed += 1;

    const handler = getJobHandler(job.type as JobType);

    if (!handler) {
      const message = `Nenhum handler registrado para o tipo ${job.type}.`;
      await updateJobStatus({
        id: job.id,
        status: 'FAILED',
        finalErrorCode: 'JOB_NO_HANDLER',
        finalErrorMessage: message,
      });
      summary.noHandler += 1;
      summary.failed += 1;
      summary.details.push({
        id: job.id,
        type: job.type as JobType,
        outcome: 'NO_HANDLER',
        attempts: job.attempts,
        errorCode: 'JOB_NO_HANDLER',
      });
      logger.warn('jobs.runner.no_handler', { action: 'job_no_handler', jobId: job.id });
      continue;
    }

    try {
      await handler(job);
      await updateJobStatus({ id: job.id, status: 'SUCCEEDED' });
      summary.succeeded += 1;
      summary.details.push({
        id: job.id,
        type: job.type as JobType,
        outcome: 'SUCCEEDED',
        attempts: job.attempts,
      });
      logger.info('jobs.runner.succeeded', { action: 'job_succeeded', jobId: job.id });
    } catch (err) {
      const { code, message } = summarizeError(err);
      // `claimNextJob` já incrementou `attempts`; comparar contra `maxAttempts`.
      const canRetry = job.attempts < job.maxAttempts;

      if (canRetry) {
        const delay = backoffMs(job.attempts, baseMs, maxMs);
        const nextRun = new Date(now().getTime() + delay);
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'QUEUED',
            lockedAt: null,
            lockedBy: null,
            startedAt: null,
            scheduledAt: nextRun,
            finalErrorCode: code,
            finalErrorMessage: message,
            finalErrorAt: now(),
          },
        });
        summary.requeued += 1;
        summary.details.push({
          id: job.id,
          type: job.type as JobType,
          outcome: 'REQUEUED',
          attempts: job.attempts,
          errorCode: code,
        });
        logger.warn('jobs.runner.requeued', {
          action: 'job_requeued',
          jobId: job.id,
        });
      } else {
        await updateJobStatus({
          id: job.id,
          status: 'FAILED',
          finalErrorCode: code,
          finalErrorMessage: message,
        });
        summary.failed += 1;
        summary.details.push({
          id: job.id,
          type: job.type as JobType,
          outcome: 'FAILED',
          attempts: job.attempts,
          errorCode: code,
        });
        logger.error('jobs.runner.failed', { action: 'job_failed', jobId: job.id });
      }
    }
  }

  logger.info('jobs.runner.drained', {
    action: 'job_runner_drained',
  });

  return summary;
}
