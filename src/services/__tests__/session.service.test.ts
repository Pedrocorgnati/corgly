import { SessionService } from '../session.service';

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
  });

  describe('listByStudent', () => {
    it('should return empty array (stub)', async () => {
      const result = await service.listByStudent('user-id');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe('listAll', () => {
    it('should return empty paginated result (stub)', async () => {
      const result = await service.listAll({});
      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('create', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(
        service.create('user-id', { availabilitySlotId: '550e8400-e29b-41d4-a716-446655440000' }),
      ).rejects.toThrow('Not implemented');
    });
  });
});
