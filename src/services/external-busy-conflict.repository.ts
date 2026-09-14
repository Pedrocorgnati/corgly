/**
 * Repositorio folha do ledger de CONFLITOS entre ocupacao externa e aula ja
 * vendida (item 025).
 *
 * MESMA RESTRICAO DE IMPORTACAO do irmao `external-busy.repository.ts` (item
 * 016): este arquivo importa apenas `@/lib/prisma` e tipos do client, nenhum
 * servico. A projecao (`external-busy.service.ts`) chama
 * `blockSlot`/`unblockSlot` de `availability.service.ts`, e qualquer import de
 * servico aqui reabriria o risco de ciclo que aquela restricao fecha.
 *
 * O que este ledger NAO faz: nada sobre a sessao. Ele registra que a ocupacao
 * externa e a aula vendida colidem no mesmo slot e acompanha o ciclo de vida do
 * fato (detectado, notificado, resolvido). Cancelar, reagendar ou alterar a
 * sessao violaria F8 e e decisao humana.
 */

import { prisma } from '@/lib/prisma';

/** Projecao minima do conflito consumida pelo servico. */
export interface ConflitoAberto {
  id: string;
  intervalId: string;
  slotId: string;
  sessionId: string;
  detectedAt: Date;
  notifiedAt: Date | null;
}

const CONFLICT_SELECT = {
  id: true,
  intervalId: true,
  slotId: true,
  sessionId: true,
  detectedAt: true,
  notifiedAt: true,
} as const;

/** Lease curto: uma nova sincronizacao recupera um processo interrompido. */
export const NOTIFICATION_CLAIM_TTL_MS = 2 * 60 * 1000;

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

/**
 * Abre (ou reencontra) o conflito do par (ocupacao, sessao). Idempotente pela
 * unique composta `UNIQUE_external_busy_conflict_interval_session`.
 *
 * Um `updateMany` condicional permite que apenas uma execucao reabra uma linha
 * resolvida. Para linha nova, a constraint do banco arbitra a corrida entre a
 * leitura e o create: o vencedor cria; o perdedor recebe P2002 e reencontra a
 * mesma linha. O caminho comum de re-sync nao depende de excecao.
 *
 * `criado` e informativo. A elegibilidade para aviso e decidida pelo claim
 * atomico abaixo, nunca por uma leitura previa sujeita a corrida.
 */
export async function openConflict(input: {
  intervalId: string;
  slotId: string;
  sessionId: string;
  detectedAt?: Date;
}): Promise<{ conflito: ConflitoAberto; criado: boolean }> {
  const detectedAt = input.detectedAt ?? new Date();
  const reaberto = await prisma.externalBusyConflict.updateMany({
    where: {
      intervalId: input.intervalId,
      sessionId: input.sessionId,
      resolvedAt: { not: null },
    },
    data: {
      slotId: input.slotId,
      detectedAt,
      resolvedAt: null,
      notifiedAt: null,
      notificationClaimId: null,
      notificationClaimedAt: null,
      notificationAttempts: 0,
      notificationLastError: null,
    },
  });

  const existente = await prisma.externalBusyConflict.findUnique({
    where: {
      intervalId_sessionId: {
        intervalId: input.intervalId,
        sessionId: input.sessionId,
      },
    },
    select: CONFLICT_SELECT,
  });

  if (existente) {
    return { conflito: existente, criado: reaberto.count === 1 };
  }

  try {
    const conflito = await prisma.externalBusyConflict.create({
      data: {
        intervalId: input.intervalId,
        slotId: input.slotId,
        sessionId: input.sessionId,
        detectedAt,
      },
      select: CONFLICT_SELECT,
    });
    return { conflito, criado: true };
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
  }

  const conflito = await prisma.externalBusyConflict.findUniqueOrThrow({
    where: {
      intervalId_sessionId: {
        intervalId: input.intervalId,
        sessionId: input.sessionId,
      },
    },
    select: CONFLICT_SELECT,
  });

  return { conflito, criado: false };
}

/**
 * Tenta adquirir o direito exclusivo de enviar o aviso. Um claim abandonado
 * expira, permitindo retry por uma sincronizacao futura.
 */
export async function claimNotification(
  conflictId: string,
  claimId: string,
  claimedAt: Date = new Date(),
): Promise<boolean> {
  const expiredBefore = new Date(claimedAt.getTime() - NOTIFICATION_CLAIM_TTL_MS);
  const resultado = await prisma.externalBusyConflict.updateMany({
    where: {
      id: conflictId,
      resolvedAt: null,
      notifiedAt: null,
      OR: [
        { notificationClaimId: null },
        { notificationClaimedAt: { lt: expiredBefore } },
      ],
    },
    data: {
      notificationClaimId: claimId,
      notificationClaimedAt: claimedAt,
      notificationAttempts: { increment: 1 },
      notificationLastError: null,
    },
  });
  return resultado.count === 1;
}

/** Carimba a entrega somente se o chamador ainda for dono do claim. */
export async function markNotified(
  conflictId: string,
  claimId: string,
  notifiedAt: Date = new Date(),
): Promise<boolean> {
  const resultado = await prisma.externalBusyConflict.updateMany({
    where: {
      id: conflictId,
      resolvedAt: null,
      notifiedAt: null,
      notificationClaimId: claimId,
    },
    data: {
      notifiedAt,
      notificationClaimId: null,
      notificationClaimedAt: null,
      notificationLastError: null,
    },
  });
  return resultado.count === 1;
}

/** Libera um claim falho sem apagar a evidencia operacional do erro. */
export async function releaseNotificationClaim(
  conflictId: string,
  claimId: string,
  error: string,
): Promise<boolean> {
  const resultado = await prisma.externalBusyConflict.updateMany({
    where: { id: conflictId, notifiedAt: null, notificationClaimId: claimId },
    data: {
      notificationClaimId: null,
      notificationClaimedAt: null,
      notificationLastError: error.slice(0, 500),
    },
  });
  return resultado.count === 1;
}

/**
 * Fecha todos os conflitos ABERTOS de uma ocupacao. Gatilho: a ocupacao sumiu
 * da agenda de origem (`revokeBusy`), entao nao ha mais com o que colidir.
 */
export async function resolveByInterval(intervalId: string, resolvedAt?: Date): Promise<number> {
  const resultado = await prisma.externalBusyConflict.updateMany({
    where: { intervalId, resolvedAt: null },
    data: {
      resolvedAt: resolvedAt ?? new Date(),
      notificationClaimId: null,
      notificationClaimedAt: null,
    },
  });
  return resultado.count;
}

/**
 * Fecha os conflitos ABERTOS de um slot. Gatilho: `blockSlot` que antes falhava
 * com `AVAILABILITY_051` passou a ser aceito — a sessao ocupante deixou de
 * estar SCHEDULED/IN_PROGRESS. O job observa que o bloqueio virou permitido; ele
 * nao decide nada sobre a sessao.
 */
export async function resolveBySlot(slotId: string, resolvedAt?: Date): Promise<number> {
  const resultado = await prisma.externalBusyConflict.updateMany({
    where: { slotId, resolvedAt: null },
    data: {
      resolvedAt: resolvedAt ?? new Date(),
      notificationClaimId: null,
      notificationClaimedAt: null,
    },
  });
  return resultado.count;
}

/**
 * Fecha apenas conflitos desta ocupacao cujo slot deixou de intersectar a
 * janela atual. E o caminho usado quando um evento do Google e movido.
 */
export async function resolveOutsideWindow(
  intervalId: string,
  window: { startAt: Date; endAt: Date },
  resolvedAt: Date = new Date(),
): Promise<number> {
  const resultado = await prisma.externalBusyConflict.updateMany({
    where: {
      intervalId,
      resolvedAt: null,
      slot: {
        is: {
          OR: [
            { startAt: { gte: window.endAt } },
            { endAt: { lte: window.startAt } },
          ],
        },
      },
    },
    data: {
      resolvedAt,
      notificationClaimId: null,
      notificationClaimedAt: null,
    },
  });
  return resultado.count;
}
