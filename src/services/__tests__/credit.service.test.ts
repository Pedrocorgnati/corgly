import { CreditService } from '../credit.service';

describe('CreditService', () => {
  let service: CreditService;

  beforeEach(() => {
    service = new CreditService();
  });

  describe('getBalance', () => {
    it('should return empty balance (stub)', async () => {
      const result = await service.getBalance('user-id');
      expect(result).toEqual({ total: 0, batches: [] });
    });
  });

  describe('consumeFEFO', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(service.consumeFEFO('user-id')).rejects.toThrow('Not implemented');
    });
  });

  describe('refund', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(service.refund('session-id')).rejects.toThrow('Not implemented');
    });
  });
});
