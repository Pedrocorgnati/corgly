import { z } from 'zod';

export const notesUpsertSchema = z.object({
  content: z.string().max(5000),
});

export type NotesUpsertInput = z.infer<typeof notesUpsertSchema>;
