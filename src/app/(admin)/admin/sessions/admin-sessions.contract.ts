import { z } from 'zod';

/**
 * Contrato REAL de `GET /api/v1/admin/sessions`.
 *
 * O produtor e `sessionService.listAllForAdmin` (src/services/session.service.ts),
 * que devolve `AdminSessionRow[]`: o `SessionWithMeta` de sempre MAIS os dois
 * campos que a tabela do admin mostra — `studentName` (relacao obrigatoria
 * `Session.student`) e `score` (media das 4 dimensoes canonicas do Feedback,
 * `null` quando a aula ainda nao tem feedback).
 *
 * Validar aqui e o que impede o payload de voltar a ser um cast: se alguem
 * renomear um campo no backend, a tela diz "resposta fora do formato esperado"
 * em vez de pintar a coluna de traco em silencio.
 *
 * Este modulo e ISOMORFICO de proposito (so `zod`): o client component importa
 * os tipos daqui, e o fetch server-side vive em `fetch-admin-sessions.ts`.
 */
export const adminSessionRowSchema = z.object({
  id: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  status: z.string(),
  studentName: z.string(),
  score: z.number().nullable(),
});

export type AdminSessionRowDto = z.infer<typeof adminSessionRowSchema>;

export const adminSessionsPageSchema = z.object({
  data: z.array(adminSessionRowSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export type AdminSessionsPageDto = z.infer<typeof adminSessionsPageSchema>;

/**
 * Filtro de feedback da tela. `null` = sem filtro (todas as aulas); `true` = so
 * as ja avaliadas; `false` = so as pendentes de avaliacao. E exatamente o
 * ternario que a rota aceita em `?hasFeedback=`.
 */
export type FiltroFeedback = boolean | null;

/**
 * Le `?hasFeedback=` da URL da TELA (nao da API). Texto fora do vocabulario cai
 * em `null` (sem filtro), que e o mesmo que a rota faria com o parametro
 * ausente — a tela nunca manda para a API um valor que ela recusaria com 400.
 */
export function parseFiltroFeedback(raw: string | undefined): FiltroFeedback {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}
