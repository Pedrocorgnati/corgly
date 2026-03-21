import { z } from 'zod';

const TimeRangeSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm'),
});

export const GenerateSlotsSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1),
  ranges: z.array(TimeRangeSchema).min(1),
  weeksAhead: z.number().int().min(1).max(12),
  timezone: z.string().min(1).max(100).optional().default('America/Sao_Paulo'),
});

export type GenerateSlotsInput = z.infer<typeof GenerateSlotsSchema>;
