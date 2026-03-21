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

export const BulkCancelSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().max(500).optional(),
});

export const SignalSchema = z.object({
  type: z.enum(['offer', 'answer', 'candidate', 'bye']),
  sdp: z.string().optional(),
  candidate: z.unknown().optional(),
});

export type BookSessionInput = z.infer<typeof BookSessionSchema>;
export type CancelSessionInput = z.infer<typeof CancelSessionSchema>;
export type RescheduleSessionInput = z.infer<typeof RescheduleSessionSchema>;
export type BulkCancelInput = z.infer<typeof BulkCancelSchema>;
export type SignalInput = z.infer<typeof SignalSchema>;
