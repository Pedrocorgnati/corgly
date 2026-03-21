import { AuthService } from '../auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
  });

  describe('getMe', () => {
    it('should return null (stub)', async () => {
      const result = await service.getMe('user-id');
      expect(result).toBeNull();
    });
  });

  describe('register', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(
        service.register({
          name: 'Test',
          email: 'test@test.com',
          password: '12345678',
          timezone: 'America/Sao_Paulo',
          termsAccepted: true,
          marketingOptIn: false,
        }),
      ).rejects.toThrow('Not implemented');
    });
  });

  describe('login', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(
        service.login({ email: 'test@test.com', password: '12345678' }),
      ).rejects.toThrow('Not implemented');
    });
  });
});
