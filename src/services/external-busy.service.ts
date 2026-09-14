/**
 * Servico de ledger de ocupacao externa com projecao no slot (item 016).
 *
 * Duas operacoes de escrita, ambas devolvendo `ProjecaoResultado` para que o
 * chamador (itens 021 e 023 do loop) registre o que aconteceu sem reconsultar
 * o banco. A projecao REAPROVEITA `blockSlot`/`unblockSlot` do
 * `availability.service` (transacao propria com `SELECT ... FOR UPDATE` e CAS
 * em `version`, item 012) em vez de abrir transacao propria sobre
 * `availability_slots` — um segundo escritor por fora daquele caminho criaria
 * corrida com ele.
 *
 * Classificacao de desfechos por CODIGO (`err instanceof AppError && err.code`),
 * nunca por mensagem:
 *  - bloqueio: sucesso -> `bloqueados`; `AVAILABILITY_050` e `AVAILABILITY_001`
 *    absorvidos em `jaCoerentes` (projecao idempotente; slot deletado entre a
 *    leitura e a escrita nao precisa de projecao); `AVAILABILITY_051` (sessao
 *    viva) registrado em `conflitos` — NAO bloqueia, NAO cancela a sessao
 *    (aula vendida nunca e cancelada pela projecao, F8); `AVAILABILITY_053` e
 *    `AVAILABILITY_054` propagados ao chamador, sem retry local.
 *  - desbloqueio: sucesso -> `liberados`; `AVAILABILITY_052` e
 *    `AVAILABILITY_001` absorvidos em `jaCoerentes`; `AVAILABILITY_053` e
 *    `AVAILABILITY_054` propagados.
 *
 * Os lacos sao SERIAIS de proposito: cada `blockSlot`/`unblockSlot` abre
 * transacao com `FOR UPDATE` na mesma tabela, e disparar o lote em paralelo
 * produz contencao artificial (`AVAILABILITY_054`) contra a propria projecao.
 * A janela de sincronizacao e de dezenas de slots, nao de milhares.
 */

import { prisma } from '@/lib/prisma';
import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { EmailType, type SupportedLanguage } from '@/lib/constants/enums';
import { availabilityService } from '@/services/availability.service';
import { emailService } from '@/services/email.service';
import {
  claimNotification,
  markNotified,
  openConflict,
  releaseNotificationClaim,
  resolveByInterval,
  resolveOutsideWindow,
  resolveBySlot,
  type ConflitoAberto,
} from './external-busy-conflict.repository';
import {
  cobre,
  findByExternalEventId,
  listActiveOverlapping,
  markRevoked,
  upsertBusy,
  validarIntervalo,
  type Intervalo,
} from './external-busy.repository';

export interface ProjecaoResultado {
  intervaloId: string | null;
  /** Slots que passaram a carregar GOOGLE. */
  bloqueados: string[];
  /** Slots que perderam o GOOGLE. */
  liberados: string[];
  /** Slots que ja estavam no estado certo (absorvidos). */
  jaCoerentes: string[];
  /**
   * Slots com sessao viva: registrado, nunca cancelado (F8). `conflictId` e
   * `sessionId` sao opcionais porque o conflito so e persistido quando o
   * `AVAILABILITY_051` traz `details.sessionId` (item 025); erro vindo de
   * caminho antigo continua contabilizado em memoria.
   */
  conflitos: Array<{
    slotId: string;
    motivo: 'SESSAO_VIVA';
    conflictId?: string;
    sessionId?: string;
  }>;
}

interface SlotProjecao {
  id: string;
  startAt: Date;
  endAt: Date;
  blockOrigin: string | null;
}

export class ExternalBusyService {
  /** Slots cuja janela intersecta [startAt, endAt), com a origem para decidir projecao. */
  private async slotsCobertos(startAt: Date, endAt: Date): Promise<SlotProjecao[]> {
    return prisma.availabilitySlot.findMany({
      where: { startAt: { lt: endAt }, endAt: { gt: startAt } },
      select: { id: true, startAt: true, endAt: true, blockOrigin: true },
    });
  }

  /** Slot ainda carrega bloqueio Google (proprio ou somado ao manual). */
  private carregaGoogle(slot: SlotProjecao): boolean {
    return slot.blockOrigin === 'GOOGLE' || slot.blockOrigin === 'BOTH';
  }

  /**
   * Alguma ocupacao VIGENTE ainda cobre o slot? Consulta o ledger pelo
   * predicado canonico meio-aberto. Sem esta checagem, dois compromissos
   * sobrepostos na agenda liberariam o horario quando o primeiro fosse apagado.
   */
  private async temCoberturaVigente(slot: Intervalo): Promise<boolean> {
    const vigentes = await listActiveOverlapping(slot.startAt, slot.endAt);
    return vigentes.some((ocupacao) => cobre(slot, ocupacao));
  }

  /**
   * Tenta avisar o professor sobre uma entrega ainda pendente. `recordBusy` nao recebe
   * `userId` — quem dispara e a sincronizacao —, entao o destinatario e
   * resolvido aqui: a escola tem professor unico e o papel dele e `ADMIN`.
   *
   * O claim persistido concede o envio a uma unica execucao concorrente. A
   * chamada e aguardada para sobreviver ao ciclo de vida serverless; qualquer
   * falha libera o claim e deixa `notifiedAt` NULL para retry no proximo sync.
   */
  private async tentaNotificarProfessor(
    conflito: ConflitoAberto,
    janela: Intervalo,
  ): Promise<void> {
    if (conflito.notifiedAt !== null) return;

    const claimId = randomUUID();
    try {
      const claimed = await claimNotification(conflito.id, claimId);
      if (!claimed) return;

      const professor = await prisma.user.findFirst({
        where: { role: 'ADMIN' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, preferredLanguage: true },
      });
      if (!professor) {
        await releaseNotificationClaim(conflito.id, claimId, 'ADMIN_NOT_FOUND');
        logger.warn('[ExternalBusyService] conflito sem professor para notificar', {
          conflictId: conflito.id,
        });
        return;
      }

      await emailService.send({
        to: professor.email,
        type: EmailType.EXTERNAL_BUSY_CONFLICT,
        data: {
          inicio: janela.startAt.toISOString(),
          fim: janela.endAt.toISOString(),
          sessionId: conflito.sessionId,
        },
        locale: professor.preferredLanguage as SupportedLanguage,
        // Estavel durante o ciclo do conflito. O Resend deduplica retries do
        // mesmo POST mesmo se o processo cair depois de o provedor aceitar.
        idempotencyKey: `external-busy-conflict/${conflito.id}/${conflito.detectedAt.getTime()}`,
      });
      await markNotified(conflito.id, claimId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await releaseNotificationClaim(conflito.id, claimId, message).catch((releaseError) =>
        logger.error(
          '[ExternalBusyService] falha ao liberar claim de notificacao',
          { conflictId: conflito.id, claimId },
          releaseError,
        ),
      );
      logger.error(
        '[ExternalBusyService] falha ao notificar conflito',
        { conflictId: conflito.id },
        err,
      );
    }
  }

  /**
   * Desfechos de `blockSlot` mapeados para o resultado (tabela do item 016).
   *
   * Este e o UNICO ponto por onde `AVAILABILITY_051` passa: sync completo, sync
   * incremental e push webhook convergem todos em `recordBusy`. Persistir o
   * conflito aqui cobre os tres caminhos sem tocar nos servicos de calendario.
   */
  private async classificaBloqueio(
    err: unknown,
    slotId: string,
    resultado: ProjecaoResultado,
    contexto: { intervalId: string; janela: Intervalo },
  ): Promise<void> {
    if (err instanceof AppError) {
      if (err.code === 'AVAILABILITY_050' || err.code === 'AVAILABILITY_001') {
        resultado.jaCoerentes.push(slotId);
        return;
      }
      if (err.code === 'AVAILABILITY_051') {
        const sessionId = (err.details as { sessionId?: string } | undefined)?.sessionId;
        let conflictId: string | undefined;

        if (sessionId) {
          const { conflito } = await openConflict({
            intervalId: contexto.intervalId,
            slotId,
            sessionId,
          });
          conflictId = conflito.id;
          // Sempre tenta uma entrega pendente. O claim atomico decide quem pode
          // enviar e `notifiedAt` encerra definitivamente o trabalho.
          await this.tentaNotificarProfessor(conflito, contexto.janela);
        } else {
          logger.warn('[ExternalBusyService] AVAILABILITY_051 sem sessionId em details', {
            slotId,
          });
        }

        resultado.conflitos.push({ slotId, motivo: 'SESSAO_VIVA', conflictId, sessionId });
        return;
      }
    }
    // AVAILABILITY_053 / AVAILABILITY_054 e qualquer outro erro propagam.
    throw err;
  }

  /** Desfechos de `unblockSlot` mapeados para o resultado. */
  private classificaDesbloqueio(
    err: unknown,
    slotId: string,
    resultado: ProjecaoResultado,
  ): void {
    if (err instanceof AppError && (err.code === 'AVAILABILITY_052' || err.code === 'AVAILABILITY_001')) {
      resultado.jaCoerentes.push(slotId);
      return;
    }
    throw err;
  }

  /**
   * Libera os slots da faixa antiga que a janela nova nao cobre mais e que
   * nenhuma outra ocupacao vigente justifica. Mesmo tratamento da projecao de
   * `revokeBusy`, extraido porque `recordBusy` que MOVE a janela precisa dele
   * antes do laco de bloqueio: se o laco propagasse `AVAILABILITY_053`/`054`
   * primeiro, o upsert ja teria sobrescrito a faixa antiga e nenhuma repeticao
   * de `recordBusy` a reencontraria — estado irrecuperavel ate o item 023.
   */
  private async liberaFaixaSemCobertura(
    faixa: Intervalo,
    exceto: Intervalo,
    resultado: ProjecaoResultado,
  ): Promise<void> {
    const candidatos = await this.slotsCobertos(faixa.startAt, faixa.endAt);
    for (const slot of candidatos) {
      if (!this.carregaGoogle(slot)) continue;
      if (cobre(slot, exceto)) continue;
      if (await this.temCoberturaVigente(slot)) {
        resultado.jaCoerentes.push(slot.id);
        continue;
      }
      try {
        await availabilityService.unblockSlot(slot.id, 'GOOGLE');
        resultado.liberados.push(slot.id);
      } catch (err) {
        this.classificaDesbloqueio(err, slot.id, resultado);
      }
    }
  }

  /**
   * Registra (ou atualiza) um evento ocupado da agenda de origem e projeta no
   * slot. `syncedAt` defaulta para agora, porque quem escreve e a
   * sincronizacao e o carimbo dela e o relogio da gravacao.
   *
   * RESIDUO DECLARADO DE RECUPERABILIDADE: o upsert do passo 3 commita sozinho
   * e a reconciliacao da faixa antiga e outra transacao. Se o processo morrer
   * entre as duas, os slots da faixa antiga ficam GOOGLE sem ocupacao que os
   * cubra, e nenhuma repeticao de `recordBusy` reencontra a faixa — quem zera
   * esse residuo e o item 023 (job de reconciliacao). O criterio de aceite 4b
   * vale para a chamada que RETORNA, nao para processo interrompido.
   */
  async recordBusy(input: {
    externalEventId: string;
    startAt: Date;
    endAt: Date;
    syncedAt?: Date;
  }): Promise<ProjecaoResultado> {
    // 1. Reprova entrada invalida ANTES de qualquer leitura: um intervalo
    //    invalido nao pode nem disparar o findUnique da janela anterior.
    validarIntervalo(input);

    // 2. Janela anterior ANTES do upsert: ele sobrescreve startAt/endAt in loco,
    //    e sem esta leitura previa a faixa antiga desaparece antes da
    //    reconciliacao do passo 4.
    const anterior = await findByExternalEventId(input.externalEventId);
    const janelaAnterior: Intervalo | null =
      anterior && anterior.revokedAt === null
        ? { startAt: anterior.startAt, endAt: anterior.endAt }
        : null;

    // 3. Upsert (revalida e propaga EXTERNAL_BUSY_001 / EXTERNAL_BUSY_002).
    const intervalo = await upsertBusy({
      externalEventId: input.externalEventId,
      startAt: input.startAt,
      endAt: input.endAt,
      syncedAt: input.syncedAt ?? new Date(),
    });

    const resultado: ProjecaoResultado = {
      intervaloId: intervalo.id,
      bloqueados: [],
      liberados: [],
      jaCoerentes: [],
      conflitos: [],
    };

    const janelaNova: Intervalo = { startAt: intervalo.startAt, endAt: intervalo.endAt };

    // 4. Reconciliacao da faixa liberada pelo upsert, ANTES do laco de bloqueio
    //    (ver doc de `liberaFaixaSemCobertura`). Sem este passo, mover um
    //    compromisso das 14h para as 16h deixaria as 14h bloqueadas para sempre:
    //    o unico outro caminho que libera slot e `revokeBusy`, e ele nunca e
    //    chamado para um evento que continua existindo na origem.
    if (
      janelaAnterior &&
      (janelaAnterior.startAt.getTime() !== janelaNova.startAt.getTime() ||
        janelaAnterior.endAt.getTime() !== janelaNova.endAt.getTime())
    ) {
      await resolveOutsideWindow(intervalo.id, janelaNova);
      await this.liberaFaixaSemCobertura(janelaAnterior, janelaNova, resultado);
    }

    // 5. Projecao sobre a janela nova.
    const slots = await this.slotsCobertos(janelaNova.startAt, janelaNova.endAt);
    for (const slot of slots) {
      try {
        await availabilityService.blockSlot(slot.id, 'GOOGLE');
        resultado.bloqueados.push(slot.id);
        // Bloqueio que antes falhava com AVAILABILITY_051 agora passou: a sessao
        // ocupante deixou de estar viva, entao o conflito daquele slot esta
        // materialmente resolvido. O job so OBSERVA — nao decide nada sobre a
        // aula (F8).
        await resolveBySlot(slot.id);
      } catch (err) {
        await this.classificaBloqueio(err, slot.id, resultado, {
          intervalId: intervalo.id,
          janela: janelaNova,
        });
      }
    }

    return resultado;
  }

  /**
   * Revoga uma ocupacao e projeta a liberacao. Idempotente por construcao:
   * id desconhecido devolve resultado vazio (`intervaloId: null`) sem lancar, e
   * `markRevoked` com `count === 0` (linha ja carimbada) NAO encerra a
   * operacao — ele reprojeta assim mesmo, porque esse e exatamente o estado
   * deixado por uma chamada anterior que revogou a linha e morreu no meio da
   * projecao com `AVAILABILITY_053`/`054`. Um `return` antecipado aqui tornaria
   * esse estado permanente; repetir a projecao custa uma consulta, nao uma
   * correcao errada (ela absorve `AVAILABILITY_052`/`001` em `jaCoerentes`).
   */
  async revokeBusy(
    externalEventId: string,
    options?: { revokedAt?: Date },
  ): Promise<ProjecaoResultado> {
    const intervalo = await findByExternalEventId(externalEventId);
    if (!intervalo) {
      return {
        intervaloId: null,
        bloqueados: [],
        liberados: [],
        jaCoerentes: [],
        conflitos: [],
      };
    }

    await markRevoked(externalEventId, options?.revokedAt ?? new Date());

    // O compromisso sumiu da agenda de origem: nao ha mais com o que colidir.
    await resolveByInterval(intervalo.id);

    const resultado: ProjecaoResultado = {
      intervaloId: intervalo.id,
      bloqueados: [],
      liberados: [],
      jaCoerentes: [],
      conflitos: [],
    };

    const faixa: Intervalo = { startAt: intervalo.startAt, endAt: intervalo.endAt };
    const slots = await this.slotsCobertos(faixa.startAt, faixa.endAt);
    for (const slot of slots) {
      if (!this.carregaGoogle(slot)) continue;
      if (await this.temCoberturaVigente(slot)) {
        resultado.jaCoerentes.push(slot.id);
        continue;
      }
      try {
        await availabilityService.unblockSlot(slot.id, 'GOOGLE');
        resultado.liberados.push(slot.id);
      } catch (err) {
        this.classificaDesbloqueio(err, slot.id, resultado);
      }
    }

    return resultado;
  }
}

export const externalBusyService = new ExternalBusyService();
