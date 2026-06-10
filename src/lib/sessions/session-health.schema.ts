import { z } from 'zod';

/**
 * Domínio de session health (§12.4.1 realtime operacional / §12.4.4).
 * Normaliza eventos enviados pelo cliente antes de persistir latência,
 * jitter, packet loss, estado WebRTC, reconexões e participante.
 */

export const WEBRTC_CONNECTION_STATES = [
  'NEW',
  'CHECKING',
  'CONNECTED',
  'COMPLETED',
  'DISCONNECTED',
  'FAILED',
  'CLOSED',
] as const;

export const SESSION_HEALTH_EVENT_TYPES = [
  'METRIC_SNAPSHOT',
  'CONNECTION_STATE',
  'RECONNECT_ATTEMPT',
  'RECONNECT_SUCCESS',
  'RECONNECT_FAILED',
] as const;

export const SESSION_HEALTH_PARTICIPANT_ROLES = ['STUDENT', 'ADMIN'] as const;

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

const normalizeBooleanToken = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'sim'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'nao', 'não'].includes(normalized)) {
    return false;
  }

  return value;
};

export const webRtcConnectionStateSchema = z.preprocess(
  normalizeEnumToken,
  z.enum(WEBRTC_CONNECTION_STATES),
);

export const sessionHealthEventTypeSchema = z.preprocess(
  normalizeEnumToken,
  z.enum(SESSION_HEALTH_EVENT_TYPES),
);

export const sessionHealthParticipantRoleSchema = z.preprocess(
  normalizeEnumToken,
  z.enum(SESSION_HEALTH_PARTICIPANT_ROLES),
);

export const sessionHealthMetricSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(60_000);

export const packetLossPercentSchema = z.coerce
  .number()
  .min(0)
  .max(100)
  .transform((value) => Math.round(value * 100) / 100);

export const createSessionHealthEventSchema = z
  .object({
    sessionId: z.string().uuid('sessionId inválido'),
    participantId: z.string().uuid('participantId inválido').optional(),
    participantRole: sessionHealthParticipantRoleSchema,
    eventType: sessionHealthEventTypeSchema.default('METRIC_SNAPSHOT'),
    occurredAt: z.coerce.date().default(() => new Date()),
    latencyMs: sessionHealthMetricSchema.optional(),
    jitterMs: sessionHealthMetricSchema.optional(),
    packetLossPercent: packetLossPercentSchema.optional(),
    webrtcState: webRtcConnectionStateSchema,
    reconnectAttempt: z.coerce.number().int().min(0).max(100).default(0),
    reconnectReason: z.string().trim().min(1).max(255).optional(),
    reconnectSuccessful: z.preprocess(normalizeBooleanToken, z.boolean()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.eventType === 'METRIC_SNAPSHOT' && data.latencyMs === undefined && data.jitterMs === undefined && data.packetLossPercent === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['latencyMs'],
        message: 'Informe latência, jitter ou packet loss para snapshot de métricas',
      });
    }

    if (data.eventType.startsWith('RECONNECT') && data.reconnectAttempt < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reconnectAttempt'],
        message: 'Evento de reconnect exige reconnectAttempt >= 1',
      });
    }

    if (data.eventType === 'RECONNECT_FAILED' && data.reconnectSuccessful === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reconnectSuccessful'],
        message: 'RECONNECT_FAILED não pode ter reconnectSuccessful=true',
      });
    }
  });

export const clientSessionHealthEventSchema = createSessionHealthEventSchema.transform((event) => ({
  ...event,
  occurredAt: event.occurredAt,
  reconnectSuccessful:
    event.reconnectSuccessful ??
    (event.eventType === 'RECONNECT_SUCCESS' ? true : event.eventType === 'RECONNECT_FAILED' ? false : undefined),
}));

export const sessionHealthQuerySchema = z
  .object({
    sessionId: z.string().uuid('sessionId inválido'),
    participantId: z.string().uuid('participantId inválido').optional(),
    participantRole: sessionHealthParticipantRoleSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    eventType: sessionHealthEventTypeSchema.optional(),
    webrtcState: webRtcConnectionStateSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'],
    message: 'Janela temporal inválida',
  });

export const sessionHealthReadSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  participantId: z.string().uuid().nullable(),
  participantRole: sessionHealthParticipantRoleSchema,
  eventType: sessionHealthEventTypeSchema,
  occurredAt: z.coerce.date(),
  latencyMs: z.number().int().nullable(),
  jitterMs: z.number().int().nullable(),
  packetLossPercent: z.coerce.number().nullable(),
  webrtcState: webRtcConnectionStateSchema,
  reconnectAttempt: z.number().int(),
  reconnectReason: z.string().nullable(),
  reconnectSuccessful: z.boolean().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.coerce.date(),
});

export type WebRtcConnectionState = z.infer<typeof webRtcConnectionStateSchema>;
export type SessionHealthEventType = z.infer<typeof sessionHealthEventTypeSchema>;
export type SessionHealthParticipantRole = z.infer<typeof sessionHealthParticipantRoleSchema>;
export type CreateSessionHealthEventInput = z.infer<typeof createSessionHealthEventSchema>;
export type ClientSessionHealthEvent = z.infer<typeof clientSessionHealthEventSchema>;
export type SessionHealthQuery = z.infer<typeof sessionHealthQuerySchema>;
export type SessionHealthRead = z.infer<typeof sessionHealthReadSchema>;
