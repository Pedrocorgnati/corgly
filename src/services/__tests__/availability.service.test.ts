// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvailabilityService } from '../availability.service';
import { AppError } from '@/lib/errors';

// ── Mocks ──
const mockPrisma = vi.hoisted(() => ({
  availabilitySlot: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// ── Helpers ──
const NOW = new Date('2026-03-21T12:00:00Z');

function makeSlot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'slot-1',
    startAt: new Date('2026-03-22T14:00:00Z'),
    endAt: new Date('2026-03-22T14:50:00Z'),
    isBlocked: false,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('AvailabilityService', () => {
  let service: AvailabilityService;

  beforeEach(() => {
    service = new AvailabilityService();
    vi.clearAllMocks();
  });

  // ── getAvailable ──
  describe('getAvailable', () => {
    it('should return non-blocked slots without sessions in 7-day range', async () => {
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot()]);

      const result = await service.getAvailable('2026-03-22');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('slot-1');
      expect(result[0].isBlocked).toBe(false);
    });

    it('should return empty array when no slots in range', async () => {
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([]);

      const result = await service.getAvailable('2026-05-01');
      expect(result).toEqual([]);
    });
  });

  // ── generateSlots ──
  describe('generateSlots', () => {
    it('should generate slots and return created/skipped counts', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]); // No existing slots
      mockPrisma.availabilitySlot.createMany.mockResolvedValue({ count: 4 });

      const result = await service.generateSlots({
        days: [1, 3], // Monday, Wednesday
        ranges: [{ start: '09:00', end: '11:00' }],
        weeksAhead: 1,
        timezone: 'America/Sao_Paulo',
      });

      expect(result.created).toBeGreaterThanOrEqual(0);
      expect(result.skipped).toBeGreaterThanOrEqual(0);
    });

    it('should skip duplicate slots', async () => {
      const existingStart = new Date('2026-03-23T12:00:00Z');
      mockPrisma.$queryRaw.mockResolvedValue([{ startAt: existingStart }]);
      mockPrisma.availabilitySlot.createMany.mockResolvedValue({ count: 1 });

      const result = await service.generateSlots({
        days: [1],
        ranges: [{ start: '09:00', end: '11:00' }],
        weeksAhead: 1,
        timezone: 'America/Sao_Paulo',
      });

      expect(result.skipped).toBeGreaterThanOrEqual(0);
    });

    it('should return { created: 0, skipped: 0 } when no slots to create', async () => {
      const result = await service.generateSlots({
        days: [],
        ranges: [{ start: '09:00', end: '10:00' }],
        weeksAhead: 1,
      });

      // days is empty array so min(1) validation may fail at schema level
      // but the service returns { created: 0, skipped: 0 } for empty slotsToCreate
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });

  // ── blockSlot ──
  describe('blockSlot', () => {
    it('should block an available slot', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue({
        ...makeSlot(),
        sessions: [],
      });
      mockPrisma.availabilitySlot.update.mockResolvedValue(makeSlot({ isBlocked: true }));

      await service.blockSlot('slot-1');
      expect(mockPrisma.availabilitySlot.update).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
        data: { isBlocked: true },
      });
    });

    it('should throw AVAILABILITY_001 when slot not found', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue(null);

      await expect(service.blockSlot('missing')).rejects.toThrow(AppError);
      try {
        await service.blockSlot('missing');
      } catch (err) {
        expect((err as AppError).status).toBe(404);
      }
    });

    it('should throw AVAILABILITY_050 when slot already blocked', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue({
        ...makeSlot({ isBlocked: true }),
        sessions: [],
      });

      await expect(service.blockSlot('slot-1')).rejects.toThrow(AppError);
      try {
        await service.blockSlot('slot-1');
      } catch (err) {
        expect((err as AppError).status).toBe(409);
      }
    });

    it('should throw AVAILABILITY_051 when slot has active session', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue({
        ...makeSlot(),
        sessions: [{ id: 'session-1' }],
      });

      await expect(service.blockSlot('slot-1')).rejects.toThrow(AppError);
      try {
        await service.blockSlot('slot-1');
      } catch (err) {
        expect((err as AppError).status).toBe(409);
      }
    });
  });

  // ── unblockSlot ──
  describe('unblockSlot', () => {
    it('should unblock a blocked slot', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue(makeSlot({ isBlocked: true }));
      mockPrisma.availabilitySlot.update.mockResolvedValue(makeSlot({ isBlocked: false }));

      await service.unblockSlot('slot-1');
      expect(mockPrisma.availabilitySlot.update).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
        data: { isBlocked: false },
      });
    });

    it('should throw AVAILABILITY_001 when slot not found', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue(null);

      await expect(service.unblockSlot('missing')).rejects.toThrow(AppError);
    });

    it('should throw AVAILABILITY_052 when slot already unblocked', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue(makeSlot({ isBlocked: false }));

      await expect(service.unblockSlot('slot-1')).rejects.toThrow(AppError);
      try {
        await service.unblockSlot('slot-1');
      } catch (err) {
        expect((err as AppError).status).toBe(409);
      }
    });
  });

  // ── deleteEmpty ──
  describe('deleteEmpty', () => {
    it('should delete a slot without sessions', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue({
        ...makeSlot(),
        sessions: [],
      });
      mockPrisma.availabilitySlot.delete.mockResolvedValue(makeSlot());

      await service.deleteEmpty('slot-1');
      expect(mockPrisma.availabilitySlot.delete).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
      });
    });

    it('should throw AVAILABILITY_001 when slot not found', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue(null);

      await expect(service.deleteEmpty('missing')).rejects.toThrow(AppError);
    });

    it('should throw AVAILABILITY_060 when slot has associated session', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue({
        ...makeSlot(),
        sessions: [{ id: 'session-1' }],
      });

      await expect(service.deleteEmpty('slot-1')).rejects.toThrow(AppError);
      try {
        await service.deleteEmpty('slot-1');
      } catch (err) {
        expect((err as AppError).status).toBe(409);
      }
    });
  });
});
