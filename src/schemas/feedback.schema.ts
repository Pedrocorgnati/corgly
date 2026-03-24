import { z } from 'zod';

/**
 * Scores for each session-quality dimension (1–5 integer).
 * Keys match the frontend FeedbackForm DIMENSIONS array.
 */
export const feedbackScoresSchema = z.object({
  listening:   z.number().int().min(1, 'Selecione uma avaliação para Escuta').max(5),
  speaking:    z.number().int().min(1, 'Selecione uma avaliação para Fala').max(5),
  writing:     z.number().int().min(1, 'Selecione uma avaliação para Escrita').max(5),
  vocabulary:  z.number().int().min(1, 'Selecione uma avaliação para Vocabulário').max(5),
});

const qualitativeFeedbackSchema = z.object({
  listeningFeedback:  z.string().max(300).optional(),
  speakingFeedback:   z.string().max(300).optional(),
  writingFeedback:    z.string().max(300).optional(),
  vocabularyFeedback: z.string().max(300).optional(),
});

/** Student submits feedback about a session. */
export const submitFeedbackSchema = z.object({
  scores:          feedbackScoresSchema,
  overallFeedback: z
    .string()
    .min(20, 'Comentário deve ter no mínimo 20 caracteres')
    .max(500, 'Máximo 500 caracteres')
    .optional(),
}).merge(qualitativeFeedbackSchema);

/** Admin submits feedback with optional private note. */
export const adminSubmitFeedbackSchema = z.object({
  scores:          feedbackScoresSchema,
  overallFeedback: z
    .string()
    .min(20, 'Comentário deve ter no mínimo 20 caracteres')
    .max(500, 'Máximo 500 caracteres')
    .optional(),
  privateNote:     z.string().max(1000).optional(),
}).merge(qualitativeFeedbackSchema);

export type FeedbackScores           = z.infer<typeof feedbackScoresSchema>;
export type SubmitFeedbackInput      = z.infer<typeof submitFeedbackSchema>;
export type AdminSubmitFeedbackInput = z.infer<typeof adminSubmitFeedbackSchema>;

// Legacy alias kept for import compatibility
export const CreateFeedbackSchema = submitFeedbackSchema;
export type CreateFeedbackInput   = SubmitFeedbackInput;
