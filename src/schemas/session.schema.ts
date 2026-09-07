import { z } from 'zod';

export const BookSessionSchema = z.object({
  availabilitySlotId: z.string().uuid(),
});

export const CancelSessionSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const RescheduleSessionSchema = z.object({
  newAvailabilitySlotId: z.string().uuid(),
});

// Aceita `YYYY-MM-DD` (forma date-only enviada por BulkBlockModal, linhas 106 e 120)
// e tambem ISO-8601 completo, para nao quebrar chamador que ja manda data com hora.
export const DateOrDateTimeString = z.union([z.string().date(), z.string().datetime()]);

export const BulkCancelSchema = z.object({
  startDate: DateOrDateTimeString,
  endDate: DateOrDateTimeString,
  reason: z.string().max(500).optional(),
});

export const SignalSchema = z.object({
  type: z.enum(['offer', 'answer', 'candidate']),
  payload: z.record(z.string(), z.unknown()),  // RTCSdpInit | RTCIceCandidateInit
  from: z.string().optional(),     // preenchido pelo servidor
});

export type BookSessionInput = z.infer<typeof BookSessionSchema>;
export type CancelSessionInput = z.infer<typeof CancelSessionSchema>;
export type RescheduleSessionInput = z.infer<typeof RescheduleSessionSchema>;
export type BulkCancelInput = z.infer<typeof BulkCancelSchema>;
export type SignalInput = z.infer<typeof SignalSchema>;
