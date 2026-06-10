import { z } from 'zod';

/**
 * Domínio de jobs assíncronos (§12.4.4).
 * Normaliza o PostJob da API e valida payload por tipo antes de persistir
 * filas operacionais como exportação DSR e transcrição.
 */

export const JOB_TYPES = ['DATA_EXPORT', 'TRANSCRIPTION', 'EMAIL_DELIVERY', 'REPORT_EXPORT', 'CLEANUP'] as const;
export const JOB_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const;

const normalizeEnumToken = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
};

export const jobTypeSchema = z.preprocess(normalizeEnumToken, z.enum(JOB_TYPES));
export const jobStatusSchema = z.preprocess(normalizeEnumToken, z.enum(JOB_STATUSES));

export const dataExportJobPayloadSchema = z.object({
  dataRequestId: z.string().uuid('dataRequestId inválido'),
  referenceCode: z.string().trim().min(8).max(40),
  requesterEmail: z.string().trim().toLowerCase().email('E-mail inválido').max(254),
  includeSignedArchive: z.boolean().default(true),
});

export const transcriptionJobPayloadSchema = z.object({
  assetId: z.string().uuid('assetId inválido'),
  language: z.enum(['PT_BR', 'EN_US', 'ES_ES', 'IT_IT']),
  provider: z.string().trim().min(1).max(80).default('default'),
  generateCaptions: z.boolean().default(true),
});

export const genericJobPayloadSchema = z
  .record(z.string(), z.unknown())
  .refine((payload) => Object.keys(payload).length > 0, 'Payload não pode ser vazio');

export const postJobSchema = z
  .object({
    type: jobTypeSchema,
    queueName: z.string().trim().min(1).max(80).default('default'),
    payload: genericJobPayloadSchema,
    priority: z.coerce.number().int().min(0).max(100).default(0),
    maxAttempts: z.coerce.number().int().min(1).max(20).default(3),
    scheduledAt: z.coerce.date().default(() => new Date()),
    createdById: z.string().uuid('createdById inválido').optional(),
  })
  .superRefine((job, ctx) => {
    const result =
      job.type === 'DATA_EXPORT'
        ? dataExportJobPayloadSchema.safeParse(job.payload)
        : job.type === 'TRANSCRIPTION'
          ? transcriptionJobPayloadSchema.safeParse(job.payload)
          : genericJobPayloadSchema.safeParse(job.payload);

    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ['payload', ...issue.path],
        });
      }
    }
  })
  .transform((job) => ({
    ...job,
    payload:
      job.type === 'DATA_EXPORT'
        ? dataExportJobPayloadSchema.parse(job.payload)
        : job.type === 'TRANSCRIPTION'
          ? transcriptionJobPayloadSchema.parse(job.payload)
          : job.payload,
  }));

export const updateJobStatusSchema = z
  .object({
    id: z.string().uuid('id inválido'),
    status: jobStatusSchema,
    attempts: z.coerce.number().int().min(0).max(100).optional(),
    lockedBy: z.string().trim().max(120).optional(),
    finalErrorCode: z.string().trim().max(80).optional(),
    finalErrorMessage: z.string().trim().max(4000).optional(),
  })
  .superRefine((job, ctx) => {
    if (job.status === 'FAILED' && !job.finalErrorMessage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finalErrorMessage'],
        message: 'Erro final é obrigatório para jobs FAILED',
      });
    }
  });

export const jobQuerySchema = z.object({
  id: z.string().uuid('id inválido').optional(),
  type: jobTypeSchema.optional(),
  status: jobStatusSchema.optional(),
  queueName: z.string().trim().max(80).optional(),
  scheduledBefore: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type JobType = z.infer<typeof jobTypeSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type DataExportJobPayload = z.infer<typeof dataExportJobPayloadSchema>;
export type TranscriptionJobPayload = z.infer<typeof transcriptionJobPayloadSchema>;
export type PostJobInput = z.input<typeof postJobSchema>;
export type CreateJobInput = z.output<typeof postJobSchema>;
export type UpdateJobStatusInput = z.infer<typeof updateJobStatusSchema>;
export type JobQueryInput = z.input<typeof jobQuerySchema>;
export type JobQuery = z.infer<typeof jobQuerySchema>;
