import { z } from 'zod';

const ALLOWED_YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be'];

// ST003 — validação de domínio youtubeUrl (THREAT-MODEL T-014 SSRF)
const youtubeUrlSchema = z
  .string()
  .url('URL inválida')
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return ALLOWED_YOUTUBE_HOSTS.includes(parsed.hostname) && parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'URL deve ser do domínio youtube.com ou youtu.be e usar HTTPS' },
  );

export const CreateContentSchema = z.object({
  title: z.string().min(1).max(255),
  type: z.enum(['VIDEO', 'ARTICLE']),
  youtubeUrl: youtubeUrlSchema.max(500).optional(),
  description: z.string().max(2000).optional(),
  transcript: z.string().optional(),
  language: z.enum(['PT_BR', 'EN_US', 'ES_ES', 'IT_IT']),
  sortOrder: z.number().int().min(0).optional().default(0),
  isPublished: z.boolean().optional().default(false),
});

export const UpdateContentSchema = CreateContentSchema.partial();

export type CreateContentInput = z.infer<typeof CreateContentSchema>;
export type UpdateContentInput = z.infer<typeof UpdateContentSchema>;
