// @vitest-environment node
/**
 * GAP-07 (item 018) - `generateSlots` sem `timezone` le o fuso canonico.
 *
 * O servico ja resolve `timezone ?? getCanonicalTimezone()`; o defeito estava
 * no schema, que nunca deixava o fuso chegar ausente. Este arquivo trava o
 * lado do servico: sem fuso, o instante sai do fuso persistido; com fuso
 * explicito, app_settings nem e consultado.
 *
 * Relogio: 2026-09-14T15:00Z e segunda-feira, entao `days: [2]` cai em
 * 2026-09-15. 09:00 em Europe/Rome (CEST, UTC+2) = 07:00Z; em Asia/Tokyo
 * (UTC+9) = 00:00Z.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ──
const mockPrisma = vi.hoisted(() => ({
  availabilitySlot: {
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
  externalBusyInterval: {
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const mocks = vi.hoisted(() => ({
  getCanonicalTimezone: vi.fn(),
}));

vi.mock('@/lib/canonical-timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/canonical-timezone')>()),
  getCanonicalTimezone: mocks.getCanonicalTimezone,
}));

import { AvailabilityService } from '../availability.service';

const PEDIDO = { days: [2], ranges: [{ start: '09:00', end: '10:00' }], weeksAhead: 1 };

describe('AvailabilityService.generateSlots - fuso canonico (GAP-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-14T15:00:00.000Z'));
    mockPrisma.availabilitySlot.findMany.mockResolvedValue([]);
    mockPrisma.availabilitySlot.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.externalBusyInterval.findMany.mockResolvedValue([]);
    mocks.getCanonicalTimezone.mockResolvedValue('Europe/Rome');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('REGRESSAO 018: sem timezone usa o fuso canonico persistido', async () => {
    await new AvailabilityService().generateSlots(PEDIDO);

    expect(mocks.getCanonicalTimezone).toHaveBeenCalledTimes(1);
    const where = mockPrisma.availabilitySlot.findMany.mock.calls[0][0].where;
    expect(where.startAt.in[0]).toEqual(new Date('2026-09-15T07:00:00.000Z'));
  });

  it('CONTROLE: timezone explicito nao le app_settings', async () => {
    await new AvailabilityService().generateSlots({ ...PEDIDO, timezone: 'Asia/Tokyo' });

    expect(mocks.getCanonicalTimezone).not.toHaveBeenCalled();
    const where = mockPrisma.availabilitySlot.findMany.mock.calls[0][0].where;
    expect(where.startAt.in[0]).toEqual(new Date('2026-09-15T00:00:00.000Z'));
  });
});
