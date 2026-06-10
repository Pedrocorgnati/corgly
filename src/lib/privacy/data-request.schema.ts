import { z } from 'zod';

/**
 * Domínio de Data Subject Requests (§12.4.1 / §12.4.4).
 * Espelha os enums Prisma DataRequest* e separa entrada pública dos campos
 * operacionais preenchidos pelo servidor, como SLA, arquivo assinado e job.
 */

export const DATA_REQUEST_TYPES = ['EXPORT', 'RECTIFICATION', 'PORTABILITY', 'DELETION'] as const;
export const DATA_REQUEST_CHANNELS = ['WEB_PORTAL', 'EMAIL', 'SUPPORT', 'ADMIN'] as const;
export const DATA_REQUEST_STATUSES = [
  'PENDING_EMAIL_VERIFICATION',
  'PENDING',
  'IN_PROGRESS',
  'EXPORT_READY',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const;
export const DATA_REQUEST_JOB_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const;

export const dataRequestTypeSchema = z.enum(DATA_REQUEST_TYPES);
export const dataRequestChannelSchema = z.enum(DATA_REQUEST_CHANNELS);
export const dataRequestStatusSchema = z.enum(DATA_REQUEST_STATUSES);
export const dataRequestJobStatusSchema = z.enum(DATA_REQUEST_JOB_STATUSES);

export const dataRequestEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('E-mail inválido')
  .max(254, 'E-mail excede 254 caracteres');

export const dataRequestReferenceCodeSchema = z
  .string()
  .trim()
  .min(8, 'Código muito curto')
  .max(40, 'Código excede 40 caracteres')
  .regex(/^DSR-[A-Z0-9-]+$/, 'Código deve iniciar com DSR- e usar letras maiúsculas, números ou hífen');

const correctionPayloadSchema = z
  .record(z.string(), z.unknown())
  .refine((payload) => Object.keys(payload).length > 0, 'Informe ao menos um campo para correção');

/** Entrada pública para pedido anônimo ou autenticado. */
export const createDataRequestSchema = z
  .object({
    type: dataRequestTypeSchema,
    channel: dataRequestChannelSchema.default('WEB_PORTAL'),
    requesterEmail: dataRequestEmailSchema,
    correctionPayload: correctionPayloadSchema.optional(),
    message: z.string().trim().max(2000, 'Mensagem excede 2000 caracteres').optional(),
    privacyAccepted: z.literal(true, {
      message: 'É necessário aceitar a política de privacidade para abrir o pedido',
    }),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'RECTIFICATION' && !data.correctionPayload) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctionPayload'],
        message: 'Pedidos de correção exigem os dados a corrigir',
      });
    }
  });

/** Consulta pública de status por código e e-mail verificado. */
export const lookupDataRequestSchema = z.object({
  referenceCode: dataRequestReferenceCodeSchema,
  requesterEmail: dataRequestEmailSchema,
});

/** Atualização administrativa do ciclo de vida do pedido. */
export const updateDataRequestStatusSchema = z
  .object({
    referenceCode: dataRequestReferenceCodeSchema,
    status: dataRequestStatusSchema,
    signedArchiveUrl: z.string().trim().url('URL de arquivo assinada inválida').max(1000).optional(),
    signedArchiveSha256: z.string().trim().regex(/^[a-f0-9]{64}$/i, 'SHA-256 inválido').optional(),
    signedArchiveExpiresAt: z.coerce.date().optional(),
    rejectionReason: z.string().trim().min(1).max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'EXPORT_READY') {
      for (const field of ['signedArchiveUrl', 'signedArchiveSha256', 'signedArchiveExpiresAt'] as const) {
        if (!data[field]) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'Obrigatório quando status é EXPORT_READY' });
        }
      }
    }
    if (data.status === 'REJECTED' && !data.rejectionReason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rejectionReason'], message: 'Motivo obrigatório para rejeição' });
    }
  });

export const dataRequestQuerySchema = z.object({
  type: dataRequestTypeSchema.optional(),
  channel: dataRequestChannelSchema.optional(),
  status: dataRequestStatusSchema.optional(),
  requesterEmail: dataRequestEmailSchema.optional(),
  dueBefore: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateDataRequestInput = z.infer<typeof createDataRequestSchema>;
export type LookupDataRequestInput = z.infer<typeof lookupDataRequestSchema>;
export type UpdateDataRequestStatusInput = z.infer<typeof updateDataRequestStatusSchema>;
export type DataRequestQuery = z.infer<typeof dataRequestQuerySchema>;
export type DataRequestType = z.infer<typeof dataRequestTypeSchema>;
export type DataRequestChannel = z.infer<typeof dataRequestChannelSchema>;
export type DataRequestStatus = z.infer<typeof dataRequestStatusSchema>;
export type DataRequestJobStatus = z.infer<typeof dataRequestJobStatusSchema>;
