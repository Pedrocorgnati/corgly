/**
 * Repositorio folha do ledger de ocupacao externa (item 016).
 *
 * RESTRICAO DE IMPORTACAO (nao remover sem reler o item 016): este arquivo e a
 * camada FOLHA do dominio. Ele importa APENAS `@/lib/prisma`, `@/lib/errors` e
 * tipos de `@prisma/client` — nenhum outro servico. A razao e o ciclo de import:
 * `availability.service.ts` (generateSlots) precisa LER este ledger, e a projecao
 * (`external-busy.service.ts`) precisa CHAMAR `blockSlot`/`unblockSlot` de la.
 * Um servico unico produziria `availability.service <-> external-busy.service`,
 * e em ESM o segundo modulo avaliado enxerga `undefined` no lugar do primeiro —
 * falha que so aparece em runtime, nao no `type-check`. Como este arquivo nao
 * importa nenhum servico, `availability.service.ts` pode depender so dele.
 */

import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import type { ExternalBusyInterval, Prisma } from '@prisma/client';

/** Par minimo para o predicado de cobertura: meio-aberto nos dois lados. */
export interface Intervalo {
  startAt: Date;
  endAt: Date;
}

/**
 * Predicado canonico de cobertura, meio-aberto nos dois lados:
 * slot que TERMINA exatamente quando a ocupacao comeca nao esta coberto, e slot
 * que COMECA exatamente quando a ocupacao termina tambem nao. Mesma convencao
 * que a grade de 50 minutos usa ao encadear `cursor` em `generateSlots`: o
 * `endAt` de um slot e o `startAt` do seguinte, e eles nao se sobrepoem.
 */
export function cobre(slot: Intervalo, ocupacao: Intervalo): boolean {
  return slot.startAt < ocupacao.endAt && slot.endAt > ocupacao.startAt;
}

/**
 * Ocupacoes VIGENTES (`revokedAt IS NULL`) que intersectam a janela recebida.
 * A forma do `where` espelha o predicado `cobre`: `startAt < fim` e
 * `endAt > inicio`. Nao inverter os operadores.
 */
export async function listActiveOverlapping(
  from: Date,
  untilExclusive: Date,
): Promise<ExternalBusyInterval[]> {
  return prisma.externalBusyInterval.findMany({
    where: {
      revokedAt: null,
      startAt: { lt: untilExclusive },
      endAt: { gt: from },
    },
    orderBy: { startAt: 'asc' },
  });
}

/**
 * Cliente transacional aceito pela rechecagem: qualquer `tx` entregue por
 * `$transaction`. Tipado por `Pick` de proposito — o helper so precisa de
 * `$queryRaw`, e exigir o `TransactionClient` inteiro obrigaria os testes a
 * montar um duble completo do Prisma so para provar um `SELECT`.
 */
export type OverlapTxClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Rechecagem de ocupacao externa DENTRO da transacao de reserva (item 024).
 *
 * Existe porque `external_busy_intervals` e `availability_slots.isBlocked` NAO
 * sao escritos atomicamente: `external-busy.service.ts` grava o ledger e so
 * depois projeta o bloqueio via `availabilityService.blockSlot`, que abre
 * transacao propria. Entre as duas escritas existe janela em que a ocupacao ja
 * vale e o slot ainda tem `isBlocked = false` — se `blockSlot` falhar ou
 * contender, a janela dura ate a proxima reconciliacao (stale de 1h). O check
 * de `isBlocked` que as transacoes de reserva ja fazem nao enxerga essa janela;
 * esta leitura enxerga.
 *
 * O chamador DEVE ja ter travado o slot com `SELECT ... FOR UPDATE` e deve
 * passar a janela da linha TRAVADA, nunca de uma leitura anterior a ela.
 *
 * O `where` espelha o predicado `cobre` (meio-aberto nos dois lados) e usa o
 * indice `IDX_external_busy_overlap`. Nao inverter os operadores, e nao
 * duplicar esta SQL: os tres caminhos de reserva chamam este helper justamente
 * para nao poderem divergir no predicado.
 */
export async function hasActiveOverlapWithTx(
  tx: OverlapTxClient,
  janela: Intervalo,
): Promise<boolean> {
  const linhas = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM external_busy_intervals
    WHERE startAt < ${janela.endAt}
      AND endAt > ${janela.startAt}
      AND revokedAt IS NULL
    LIMIT 1
  `;
  return linhas.length > 0;
}

export async function findByExternalEventId(
  externalEventId: string,
): Promise<ExternalBusyInterval | null> {
  return prisma.externalBusyInterval.findUnique({ where: { externalEventId } });
}

/**
 * Validacao PURA da entrada de escrita, sem nenhum acesso ao banco. Exportada
 * porque o servico precisa reprovar entrada invalida antes de qualquer leitura
 * (uma chamada invalida nao pode nem disparar o `findUnique` da janela
 * anterior), e a validacao nao pode existir em duas copias. Os dois codigos tem
 * prefixo proprio (`EXTERNAL_BUSY_0xx`), e as mensagens vao acentuadas, como os
 * literais ja em uso em `availability.service.ts`.
 */
export function validarIntervalo(input: {
  externalEventId: string;
  startAt: Date;
  endAt: Date;
}): void {
  if (!input.externalEventId || input.externalEventId.trim().length === 0) {
    throw new AppError('EXTERNAL_BUSY_002', 'Identificador do evento externo ausente.', 400);
  }
  if (input.endAt <= input.startAt) {
    throw new AppError(
      'EXTERNAL_BUSY_001',
      'Intervalo de ocupação inválido: fim não é posterior ao início.',
      400,
    );
  }
}

/**
 * Upsert por `externalEventId`. O `revokedAt: null` no UPDATE e o que faz um
 * evento removido e recriado na origem voltar a valer sem linha nova. Roda
 * `validarIntervalo` como primeira instrucao, antes de tocar o banco.
 */
export async function upsertBusy(input: {
  externalEventId: string;
  startAt: Date;
  endAt: Date;
  syncedAt: Date;
}): Promise<ExternalBusyInterval> {
  validarIntervalo(input);
  return prisma.externalBusyInterval.upsert({
    where: { externalEventId: input.externalEventId },
    create: {
      externalEventId: input.externalEventId,
      startAt: input.startAt,
      endAt: input.endAt,
      syncedAt: input.syncedAt,
      revokedAt: null,
    },
    update: {
      startAt: input.startAt,
      endAt: input.endAt,
      syncedAt: input.syncedAt,
      revokedAt: null,
    },
  });
}

/**
 * Carimba a revogacao. `updateMany` (e nao `update`) de proposito: em id
 * desconhecido ou ja revogado devolve `count: 0` em vez de lancar `P2025`, o
 * que torna `revokeBusy` idempotente sem `try/catch` sobre codigo de driver.
 * Quem consome o `count` decide se a projecao segue — a linha revogada com a
 * projecao interrompida no meio EXIGE reprojetar.
 */
export async function markRevoked(
  externalEventId: string,
  revokedAt: Date,
): Promise<number> {
  const resultado = await prisma.externalBusyInterval.updateMany({
    where: { externalEventId, revokedAt: null },
    data: { revokedAt },
  });
  return resultado.count;
}
