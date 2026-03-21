import { z } from 'zod';

export const CreateFeedbackSchema = z.object({
  sessionId: z.string().uuid(),
  listeningScore: z.number().int().min(1).max(5),
  speakingScore: z.number().int().min(1).max(5),
  writingScore: z.number().int().min(1).max(5),
  vocabularyScore: z.number().int().min(1).max(5),
  generalComment: z.string().min(20),
  strengths: z.string().optional(),
  improvements: z.string().optional(),
  topicsCovered: z.string().optional(),
  recommendations: z.string().optional(),
});

export type CreateFeedbackInput = z.infer<typeof CreateFeedbackSchema>;
