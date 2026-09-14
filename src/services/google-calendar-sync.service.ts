/**
 * Servico de sincronizacao de ocupacao do Google Calendar (item 021 do loop).
 *
 * Le a janela futura de eventos ocupados da agenda do professor conectado e
 * grava no ledger do item 016, projetando nos slots existentes via
 * `externalBusyService.recordBusy`/`revokeBusy`.
 *
 * Regras de negocio:
 *  - Janela futura: `now` ate um horizonte configuravel (default 90 dias).
 *  - Eventos com `transparency=transparent` NAO bloqueiam disponibilidade.
 *  - Se um evento antes opaco passar a transparente, revoga a ocupacao anterior.
 *  - A leitura percorre TODAS as paginas antes de revogar ausentes: uma lista
 *    parcial causaria liberacao indevida de horarios validos.
 *  - Falha em pagina intermediaria ou em `recordBusy` aborta a rodada antes
 *    da fase de revogacao: leitura parcial nunca libera horarios validos.
 */

import { listBusyEvents, type GoogleCalendarEvent } from '@/lib/google/calendar-client';
import { externalBusyService, type ProjecaoResultado } from './external-busy.service';
import { listActiveOverlapping } from './external-busy.repository';

export interface SyncResult {
  eventosProcessados: number;
  bloqueados: string[];
  liberados: string[];
  /**
   * Item 025: `conflictId` aponta a linha de `external_busy_conflicts` e
   * `sessionId` a aula vendida. Opcionais para nao quebrar quem so conta
   * `conflitos.length` (a rota de sync).
   */
  conflitos: Array<{ slotId: string; motivo: string; conflictId?: string; sessionId?: string }>;
}

export class GoogleCalendarSyncService {
  private readonly DEFAULT_TIME_HORIZON_DAYS = 90;

  /** Aplica uma fotografia completa ja lida, sem nova chamada ao Google. */
  async applyFullSnapshot(
    userId: string,
    events: GoogleCalendarEvent[],
    syncStartedAt: Date,
  ): Promise<SyncResult> {
    void userId;
    const result: SyncResult = {
      eventosProcessados: 0,
      bloqueados: [],
      liberados: [],
      conflitos: [],
    };
    const occupiedIds = new Set<string>();

    for (const event of events) {
      if (event.status === 'cancelled' || event.transparency === 'transparent') continue;
      if (!event.start.dateTime || !event.end.dateTime) continue;
      const projection = await externalBusyService.recordBusy({
        externalEventId: event.id,
        startAt: new Date(event.start.dateTime),
        endAt: new Date(event.end.dateTime),
        syncedAt: syncStartedAt,
      });
      occupiedIds.add(event.id);
      result.eventosProcessados++;
      result.bloqueados.push(...projection.bloqueados);
      result.liberados.push(...projection.liberados);
      result.conflitos.push(...projection.conflitos.map((item) => ({
        slotId: item.slotId,
        motivo: item.motivo,
        conflictId: item.conflictId,
        sessionId: item.sessionId,
      })));
    }

    const timeMax = new Date(
      syncStartedAt.getTime() + this.DEFAULT_TIME_HORIZON_DAYS * 24 * 60 * 60 * 1000,
    );
    const active = await listActiveOverlapping(syncStartedAt, timeMax);
    for (const busy of active) {
      if (busy.syncedAt.getTime() >= syncStartedAt.getTime() || occupiedIds.has(busy.externalEventId)) {
        continue;
      }
      const projection = await externalBusyService.revokeBusy(busy.externalEventId, {
        revokedAt: syncStartedAt,
      });
      result.liberados.push(...projection.liberados);
    }

    result.bloqueados = [...new Set(result.bloqueados)];
    result.liberados = [...new Set(result.liberados)];
    return result;
  }

  /** Aplica somente IDs presentes no delta incremental. */
  async applyIncrementalChanges(
    userId: string,
    events: GoogleCalendarEvent[],
    syncStartedAt: Date,
  ): Promise<SyncResult> {
    void userId;
    const result: SyncResult = {
      eventosProcessados: 0,
      bloqueados: [],
      liberados: [],
      conflitos: [],
    };

    for (const event of events) {
      if (
        event.status === 'cancelled'
        || event.transparency === 'transparent'
        || !event.start.dateTime
        || !event.end.dateTime
      ) {
        const projection = await externalBusyService.revokeBusy(event.id, {
          revokedAt: syncStartedAt,
        });
        result.liberados.push(...projection.liberados);
        result.eventosProcessados++;
        continue;
      }

      const projection = await externalBusyService.recordBusy({
        externalEventId: event.id,
        startAt: new Date(event.start.dateTime),
        endAt: new Date(event.end.dateTime),
        syncedAt: syncStartedAt,
      });
      result.eventosProcessados++;
      result.bloqueados.push(...projection.bloqueados);
      result.liberados.push(...projection.liberados);
      result.conflitos.push(...projection.conflitos.map((item) => ({
        slotId: item.slotId,
        motivo: item.motivo,
        conflictId: item.conflictId,
        sessionId: item.sessionId,
      })));
    }

    result.bloqueados = [...new Set(result.bloqueados)];
    result.liberados = [...new Set(result.liberados)];
    return result;
  }

  /**
   * Sincroniza a ocupacao da agenda do professor.
   *
   * @param userId ID do usuario (professor)
   * @param options Configuracoes opcionais
   * @param options.timeHorizonDays Dias a frente para sincronizar (default 90)
   * @returns Resumo da sincronizacao
   */
  async syncBusyIntervals(userId: string, options?: { timeHorizonDays?: number }): Promise<SyncResult> {
    const timeHorizonDays = options?.timeHorizonDays ?? this.DEFAULT_TIME_HORIZON_DAYS;

    // 1. Captura o marco temporal UNICO para toda a rodada
    const syncStartedAt = new Date();
    const timeMin = syncStartedAt;
    const timeMax = new Date(syncStartedAt.getTime() + timeHorizonDays * 24 * 60 * 60 * 1000);

    // 2. Le TODAS as paginas de eventos
    let events: Array<{
      id: string;
      status: 'confirmed' | 'cancelled' | 'tentative';
      startAt: Date;
      endAt: Date;
      isTransparent: boolean;
    }>;

    try {
      events = await listBusyEvents(userId, timeMin, timeMax);
    } catch (error) {
      // Falha na leitura aborta a rodada inteira
      throw error;
    }

    const result: SyncResult = {
      eventosProcessados: 0,
      bloqueados: [],
      liberados: [],
      conflitos: [],
    };

    // 3. Processa eventos ocupados (nao transparentes, nao cancelados)
    for (const event of events) {
      // Eventos cancelados sao tratados na fase de revogacao
      if (event.status === 'cancelled') {
        continue;
      }

      // Eventos transparentes nao bloqueiam disponibilidade
      if (event.isTransparent) {
        // Se o evento antes era opaco e agora e transparente, a revogacao
        // acontecera na fase 5 (ausente do conjunto de ocupados)
        continue;
      }

      // Registra o evento ocupado
      const projecao: ProjecaoResultado = await externalBusyService.recordBusy({
        externalEventId: event.id,
        startAt: event.startAt,
        endAt: event.endAt,
        syncedAt: syncStartedAt,
      });

      result.eventosProcessados++;
      result.bloqueados.push(...projecao.bloqueados);
      result.liberados.push(...projecao.liberados);
      result.conflitos.push(...projecao.conflitos.map(c => ({ slotId: c.slotId, motivo: c.motivo, conflictId: c.conflictId, sessionId: c.sessionId })));
    }

    // 4. Somente apos processar TODOS os eventos ocupados com sucesso,
    //    trata eventos que sumiram desde a ultima sincronizacao.
    //    Isso garante que uma leitura parcial NUNCA libere horarios validos.

    // Busca ocupacoes vigentes na janela
    const ocupacoesVigentes = await listActiveOverlapping(timeMin, timeMax);

    // Conjunto de IDs de eventos ocupados na resposta atual
    const eventosOcupadosAtuais = new Set(
      events
        .filter(e => e.status === 'confirmed' && !e.isTransparent)
        .map(e => e.id)
    );

    // Ocupacoes cujo evento NAO aparece mais como ocupado
    const ocupacoesParaRevogar = ocupacoesVigentes.filter(ocupacao => {
      // So revoga se foi sincronizado ANTES desta rodada
      if (ocupacao.syncedAt.getTime() >= syncStartedAt.getTime()) {
        return false;
      }
      // Revoga se o evento sumiu, foi cancelado ou passou a transparente
      return !eventosOcupadosAtuais.has(ocupacao.externalEventId);
    });

    for (const ocupacao of ocupacoesParaRevogar) {
      const projecao: ProjecaoResultado = await externalBusyService.revokeBusy(
        ocupacao.externalEventId,
        { revokedAt: syncStartedAt }
      );

      result.liberados.push(...projecao.liberados);
      // Note: bloqueados em revokeBusy indica estado inconsistente (nao esperado)
    }

    // Deduplica arrays (um mesmo slot pode aparecer em multiplos eventos sobrepostos)
    result.bloqueados = [...new Set(result.bloqueados)];
    result.liberados = [...new Set(result.liberados)];

    return result;
  }
}

export const googleCalendarSyncService = new GoogleCalendarSyncService();
