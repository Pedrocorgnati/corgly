/**
 * Testes unitarios para google-calendar-sync.service.ts.
 *
 * Mocka `listBusyEvents` e `externalBusyService` para testar a logica de
 * sincronizacao sem depender de banco ou API externa.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleCalendarSyncService } from '../google-calendar-sync.service';
import type { ProjecaoResultado } from '../external-busy.service';

// Mock do calendar-client
vi.mock('@/lib/google/calendar-client', () => ({
  listBusyEvents: vi.fn(),
}));

// Mock do external-busy.service
vi.mock('../external-busy.service', () => ({
  externalBusyService: {
    recordBusy: vi.fn(),
    revokeBusy: vi.fn(),
  },
}));

// Mock do external-busy.repository
vi.mock('../external-busy.repository', () => ({
  listActiveOverlapping: vi.fn(),
}));

import { listBusyEvents } from '@/lib/google/calendar-client';
import { externalBusyService } from '../external-busy.service';
import { listActiveOverlapping } from '../external-busy.repository';

const makeEvent = (id: string, start: string, end: string, options?: {
  status?: 'confirmed' | 'cancelled';
  isTransparent?: boolean;
}) => ({
  id,
  status: options?.status ?? 'confirmed',
  startAt: new Date(start),
  endAt: new Date(end),
  isTransparent: options?.isTransparent ?? false,
});

const makeProjecao = (overrides?: Partial<ProjecaoResultado>): ProjecaoResultado => ({
  intervaloId: 'interval-1',
  bloqueados: [],
  liberados: [],
  jaCoerentes: [],
  conflitos: [],
  ...overrides,
});

const makeOcupacao = (externalEventId: string, start: string, end: string, syncedAt: Date) => ({
  id: 'ocupacao-1',
  externalEventId,
  startAt: new Date(start),
  endAt: new Date(end),
  syncedAt,
  revokedAt: null,
});

describe('GoogleCalendarSyncService', () => {
  let service: GoogleCalendarSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GoogleCalendarSyncService();
  });

  describe('syncBusyIntervals', () => {
    it('evento ocupado -> recordBusy chamado', async () => {
      (listBusyEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeEvent('event-1', '2026-09-10T10:00:00Z', '2026-09-10T11:00:00Z'),
      ]);
      (externalBusyService.recordBusy as ReturnType<typeof vi.fn>).mockResolvedValue(makeProjecao({
        bloqueados: ['slot-1'],
      }));
      (listActiveOverlapping as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.syncBusyIntervals('user-123');

      expect(externalBusyService.recordBusy).toHaveBeenCalledWith({
        externalEventId: 'event-1',
        startAt: expect.any(Date),
        endAt: expect.any(Date),
        syncedAt: expect.any(Date),
      });
      expect(result.bloqueados).toContain('slot-1');
      expect(result.eventosProcessados).toBe(1);
    });

    it('evento transparente novo -> ignorado', async () => {
      (listBusyEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeEvent('event-1', '2026-09-10T10:00:00Z', '2026-09-10T11:00:00Z', { isTransparent: true }),
      ]);
      (listActiveOverlapping as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.syncBusyIntervals('user-123');

      expect(externalBusyService.recordBusy).not.toHaveBeenCalled();
      expect(result.eventosProcessados).toBe(0);
    });

    it('evento antes opaco que passa a transparente -> revokeBusy chamado', async () => {
      const oldSyncedAt = new Date('2026-09-09T10:00:00Z');

      (listBusyEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeEvent('event-1', '2026-09-10T10:00:00Z', '2026-09-10T11:00:00Z', { isTransparent: true }),
      ]);
      (listActiveOverlapping as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeOcupacao('event-1', '2026-09-10T10:00:00Z', '2026-09-10T11:00:00Z', oldSyncedAt),
      ]);
      (externalBusyService.revokeBusy as ReturnType<typeof vi.fn>).mockResolvedValue(makeProjecao({
        liberados: ['slot-1'],
      }));

      const result = await service.syncBusyIntervals('user-123');

      expect(externalBusyService.revokeBusy).toHaveBeenCalledWith('event-1', { revokedAt: expect.any(Date) });
      expect(result.liberados).toContain('slot-1');
    });

    it('evento removido -> revokeBusy chamado', async () => {
      const oldSyncedAt = new Date('2026-09-09T10:00:00Z');

      (listBusyEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeEvent('event-1', '2026-09-10T10:00:00Z', '2026-09-10T11:00:00Z', { status: 'cancelled' }),
      ]);
      (listActiveOverlapping as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeOcupacao('event-1', '2026-09-10T10:00:00Z', '2026-09-10T11:00:00Z', oldSyncedAt),
      ]);
      (externalBusyService.revokeBusy as ReturnType<typeof vi.fn>).mockResolvedValue(makeProjecao({
        liberados: ['slot-1'],
      }));

      const result = await service.syncBusyIntervals('user-123');

      expect(externalBusyService.revokeBusy).toHaveBeenCalled();
      expect(result.liberados).toContain('slot-1');
    });

    it('janela sem ocupacao e ledger inicialmente vazio -> nada gravado nem revogado', async () => {
      (listBusyEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (listActiveOverlapping as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.syncBusyIntervals('user-123');

      expect(externalBusyService.recordBusy).not.toHaveBeenCalled();
      expect(externalBusyService.revokeBusy).not.toHaveBeenCalled();
      expect(result.eventosProcessados).toBe(0);
      expect(result.bloqueados).toHaveLength(0);
      expect(result.liberados).toHaveLength(0);
    });

    it('evento de duracao arbitraria (2h) -> bloqueia multiplos slots', async () => {
      (listBusyEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeEvent('event-1', '2026-09-10T14:00:00Z', '2026-09-10T16:00:00Z'),
      ]);
      (externalBusyService.recordBusy as ReturnType<typeof vi.fn>).mockResolvedValue(makeProjecao({
        bloqueados: ['slot-14h', 'slot-15h'], // 2 slots de 50min cada
      }));
      (listActiveOverlapping as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.syncBusyIntervals('user-123');

      expect(result.bloqueados).toHaveLength(2);
    });

    it('conflito (slot com sessao viva) -> retorna em conflitos', async () => {
      (listBusyEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeEvent('event-1', '2026-09-10T10:00:00Z', '2026-09-10T11:00:00Z'),
      ]);
      (externalBusyService.recordBusy as ReturnType<typeof vi.fn>).mockResolvedValue(makeProjecao({
        conflitos: [{ slotId: 'slot-1', motivo: 'SESSAO_VIVA' }],
      }));
      (listActiveOverlapping as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.syncBusyIntervals('user-123');

      expect(result.conflitos).toHaveLength(1);
      expect(result.conflitos[0].slotId).toBe('slot-1');
      expect(result.conflitos[0].motivo).toBe('SESSAO_VIVA');
    });

    it('nao revoga ocupacoes sincronizadas na mesma rodada', async () => {
      const now = new Date();

      (listBusyEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      // Ocupacao com syncedAt = agora (mesma rodada)
      (listActiveOverlapping as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeOcupacao('event-1', '2026-09-10T10:00:00Z', '2026-09-10T11:00:00Z', now),
      ]);

      await service.syncBusyIntervals('user-123');

      // Nao deve revogar porque foi sincronizado na mesma rodada
      expect(externalBusyService.revokeBusy).not.toHaveBeenCalled();
    });
  });
});
