// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──
const mockPrisma = vi.hoisted(() => ({
  appSetting: {
    findUnique: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// GAP-07 (item 018): a queda no fallback passa a deixar rastro no logger.
const mockLogger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));

import {
  getCanonicalTimezone,
  canonicalLocalTimeToUtc,
  DEFAULT_CANONICAL_TIMEZONE,
} from '@/lib/canonical-timezone';
import { localTimeToUtc } from '@/lib/canonical-timezone.shared';

const MARCADOR = 'detalhe-interno-sintetico-gap07';

describe('canonical-timezone (item 018)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CONTROLE: retorna o fuso persistido em app_settings', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValue({
      key: 'timezone',
      value: 'America/Sao_Paulo',
    });
    await expect(getCanonicalTimezone()).resolves.toBe('America/Sao_Paulo');
    expect(mockPrisma.appSetting.findUnique).toHaveBeenCalledWith({
      where: { key: 'timezone' },
    });
  });

  it('cai no default quando a linha esta ausente', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValue(null);
    await expect(getCanonicalTimezone()).resolves.toBe(DEFAULT_CANONICAL_TIMEZONE);
  });

  it('RED 018 [ST007]: linha ausente registra warn com contexto fixo', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValue(null);
    await expect(getCanonicalTimezone()).resolves.toBe(DEFAULT_CANONICAL_TIMEZONE);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.any(String), {
      action: 'canonical-timezone.read',
      key: 'timezone',
      fallback: 'America/Sao_Paulo',
      reason: 'missing',
    });
  });

  it('RED 018 [ST007]: falha de leitura registra so nome e codigo', async () => {
    // O logger serializa message e stack de um terceiro argumento
    // (src/lib/logger.ts); o detalhe do driver nao pode chegar la.
    mockPrisma.appSetting.findUnique.mockRejectedValue(
      Object.assign(new Error(MARCADOR), { code: 'P1001' }),
    );
    await expect(getCanonicalTimezone()).resolves.toBe('America/Sao_Paulo');
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error.mock.calls[0]).toHaveLength(2);
    expect(mockLogger.error.mock.calls[0][1]).toEqual({
      action: 'canonical-timezone.read',
      key: 'timezone',
      fallback: 'America/Sao_Paulo',
      reason: 'read-failed',
      errorName: 'Error',
      errorCode: 'P1001',
    });
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(MARCADOR);
  });

  it('CONTROLE: fuso persistido que o Intl nao conhece cai no default com log sem o valor', async () => {
    // Review Codex F1: o valor chegava cru ao Intl e virava RangeError (500 no
    // POST de disponibilidade, recorrencia sem agendar).
    mockPrisma.appSetting.findUnique.mockResolvedValue({
      key: 'timezone',
      value: `Mars/${MARCADOR}`,
    });
    await expect(getCanonicalTimezone()).resolves.toBe(DEFAULT_CANONICAL_TIMEZONE);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error.mock.calls[0]).toHaveLength(2);
    expect(mockLogger.error.mock.calls[0][1]).toEqual({
      action: 'canonical-timezone.read',
      key: 'timezone',
      fallback: 'America/Sao_Paulo',
      reason: 'invalid-value',
    });
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(MARCADOR);

    // O conversor recebe o default em vez de lancar.
    const instante = await canonicalLocalTimeToUtc(new Date(Date.UTC(2026, 2, 10)), '09:00');
    expect(instante.toISOString()).toBe('2026-03-10T12:00:00.000Z');
  });

  it('CONTROLE: paridade: o mesmo HH:mm atravessa os dois produtores no mesmo instante UTC', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValue({
      key: 'timezone',
      value: 'America/Sao_Paulo',
    });
    const day = new Date(Date.UTC(2026, 2, 10)); // UTC midnight = dia civil alvo

    // Produtor 1 (cron.service, pos-fix): fuso canonico + conversor compartilhado
    const viaCron = await canonicalLocalTimeToUtc(day, '09:00');
    // Produtor 2 (availability.service/generateSlots): mesmo fuso, mesmo conversor
    const viaAvailability = localTimeToUtc(day, '09:00', await getCanonicalTimezone());

    expect(viaCron.getTime()).toBe(viaAvailability.getTime());
    // America/Sao_Paulo = UTC-3 (sem DST desde 2019): 09:00 local = 12:00Z.
    // O antigo setUTCHours produzia 09:00Z (3h adiantado) e o slot nunca batia:
    // a recorrencia falhava/achava slot errado em silencio.
    expect(viaCron.toISOString()).toBe('2026-03-10T12:00:00.000Z');
  });

  it('CONTROLE: sondagem Intl respeita DST do timezone persistido', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValue({
      key: 'timezone',
      value: 'America/New_York',
    });
    const verao = new Date(Date.UTC(2026, 6, 10)); // EDT = UTC-4
    const inverno = new Date(Date.UTC(2026, 0, 10)); // EST = UTC-5

    const t1 = await canonicalLocalTimeToUtc(verao, '09:00');
    const t2 = await canonicalLocalTimeToUtc(inverno, '09:00');
    expect(t1.toISOString()).toBe('2026-07-10T13:00:00.000Z');
    expect(t2.toISOString()).toBe('2026-01-10T14:00:00.000Z');
  });
});
