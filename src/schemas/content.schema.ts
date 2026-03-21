import { z } from 'zod';

export const CreateContentSchema = z.object({
  title: z.string().min(1).max(255),
  type: z.enum(['VIDEO_GRAMMAR', 'VIDEO_VOCABULARY', 'VIDEO_PRONUNCIATION']),
  youtubeUrl: z.string().url().max(500),
  description: z.string().max(2000).optional(),
  transcript: z.string().optional(),
  language: z.enum(['PT_BR', 'EN_US', 'ES_ES', 'IT_IT']),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export const UpdateContentSchema = CreateContentSchema.partial().extend({
  isPublished: z.boolean().optional(),
});

export type CreateContentInput = z.infer<typeof CreateContentSchema>;
export type UpdateContentInput = z.infer<typeof UpdateContentSchema>;
