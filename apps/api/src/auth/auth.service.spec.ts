import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('AuthService トークン発行の直列化', () => {
  const admin = {
    id: 'admin-1',
    email: 'a@example.com',
    loginId: null,
    name: 'A',
    role: 'master',
    password: 'hash-at-compare',
    isActive: true,
  };

  function createService() {
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn().mockImplementation(() => {
        calls.push('lock');
        return Promise.resolve([{ id: admin.id }]);
      }),
      admin: { findUnique: jest.fn().mockResolvedValue(admin) },
      refreshToken: {
        updateMany: jest.fn().mockImplementation(() => {
          calls.push('revoke');
          return Promise.resolve({ count: 1 });
        }),
        create: jest.fn().mockImplementation(() => {
          calls.push('create');
          return Promise.resolve({});
        }),
      },
    };
    const prisma = {
      admin: { findUnique: jest.fn().mockResolvedValue(admin) },
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rt-1', adminId: admin.id }),
      },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const jwtService = { sign: jest.fn().mockReturnValue('access-token') };
    return {
      service: new AuthService(prisma as any, jwtService as any),
      prisma,
      tx,
      calls,
    };
  }

  beforeEach(() => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  describe('refresh', () => {
    it('ロック → 条件付き失効 → 新トークン作成の順に実行する', async () => {
      const { service, tx, calls } = createService();

      const result = await service.refresh('token');

      expect(calls).toEqual(['lock', 'revoke', 'create']);
      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result.refresh_token).toEqual(expect.any(String));
    });

    it('条件付き失効の更新件数が0なら401で、新トークンを作らない', async () => {
      const { service, tx } = createService();
      tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh('token')).rejects.toThrow(UnauthorizedException);
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    });

    it('管理者が無効なら401で、新トークンを作らない', async () => {
      const { service, tx } = createService();
      tx.admin.findUnique.mockResolvedValue({ ...admin, isActive: false });

      await expect(service.refresh('token')).rejects.toThrow(UnauthorizedException);
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    });

    it('トークンが存在しなければ401で、トランザクションを開始しない', async () => {
      const { service, prisma } = createService();
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('token')).rejects.toThrow(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('ロック後に読み直したhashが一致すればトークンを作る', async () => {
      const { service, tx, calls } = createService();

      const result = await service.login({ email: admin.email, password: 'pw' });

      expect(calls).toEqual(['lock', 'create']);
      expect(result.access_token).toBe('access-token');
      expect(tx.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('照合後に読み直したhashが異なれば401で、トークンを作らない', async () => {
      const { service, tx } = createService();
      tx.admin.findUnique.mockResolvedValue({ ...admin, password: 'hash-after-reset' });

      await expect(service.login({ email: admin.email, password: 'pw' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    });

    it('照合後に無効化されていれば401で、トークンを作らない', async () => {
      const { service, tx } = createService();
      tx.admin.findUnique.mockResolvedValue({ ...admin, isActive: false });

      await expect(service.login({ email: admin.email, password: 'pw' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    });
  });
});
