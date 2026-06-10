import type { JobStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  jobQuerySchema,
  postJobSchema,
  updateJobStatusSchema,
  type JobQueryInput,
  type PostJobInput,
  type UpdateJobStatusInput,
} from './job.schema';

function toPrismaJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function completionData(status: JobStatus, error?: { code?: string; message?: string }): Prisma.JobUpdateInput {
  if (status === 'SUCCEEDED' || status === 'CANCELLED') {
    return {
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      finalErrorCode: null,
      finalErrorMessage: null,
      finalErrorAt: null,
    };
  }

  if (status === 'FAILED') {
    return {
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      finalErrorCode: error?.code ?? 'JOB_FAILED',
      finalErrorMessage: error?.message,
      finalErrorAt: new Date(),
    };
  }

  if (status === 'RUNNING') {
    return {
      startedAt: new Date(),
      lockedAt: new Date(),
    };
  }

  return {
    completedAt: null,
    lockedAt: null,
    lockedBy: null,
    finalErrorCode: null,
    finalErrorMessage: null,
    finalErrorAt: null,
  };
}

export async function createJob(input: PostJobInput) {
  const job = postJobSchema.parse(input);

  return prisma.job.create({
    data: {
      type: job.type,
      queueName: job.queueName,
      payload: toPrismaJson(job.payload),
      priority: job.priority,
      maxAttempts: job.maxAttempts,
      scheduledAt: job.scheduledAt,
      createdById: job.createdById,
    },
  });
}

export async function getJobById(id: string) {
  const query = jobQuerySchema.pick({ id: true }).required().parse({ id });

  return prisma.job.findUnique({
    where: { id: query.id },
  });
}

export async function listJobs(input: JobQueryInput = {}) {
  const query = jobQuerySchema.parse(input);
  const where: Prisma.JobWhereInput = {
    type: query.type,
    status: query.status,
    queueName: query.queueName,
    scheduledAt: query.scheduledBefore ? { lte: query.scheduledBefore } : undefined,
  };

  return prisma.job.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
}

export async function updateJobStatus(input: UpdateJobStatusInput) {
  const update = updateJobStatusSchema.parse(input);
  const error =
    update.status === 'FAILED'
      ? { code: update.finalErrorCode, message: update.finalErrorMessage }
      : undefined;

  return prisma.job.update({
    where: { id: update.id },
    data: {
      status: update.status,
      attempts: update.attempts,
      lockedBy: update.lockedBy,
      ...completionData(update.status, error),
    },
  });
}

export async function claimNextJob(queueName: string, workerId: string) {
  const [job] = await listJobs({
    queueName,
    status: 'QUEUED',
    scheduledBefore: new Date(),
    page: 1,
    limit: 1,
  });

  if (!job) {
    return null;
  }

  return prisma.job.update({
    where: { id: job.id },
    data: {
      status: 'RUNNING',
      attempts: { increment: 1 },
      startedAt: new Date(),
      lockedAt: new Date(),
      lockedBy: workerId,
    },
  });
}
