import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('new-hash'),
}));

describe('UsersService.resetPassword', () => {
  it('同じトランザクション内で、ロック → password更新 → 未失効トークンの失効 の順に実行する', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn().mockImplementation(() => {
        calls.push('lock');
        return Promise.resolve([{ id: 'admin-1' }]);
      }),
      admin: {
        update: jest.fn().mockImplementation(() => {
          calls.push('update-password');
          return Promise.resolve({ id: 'admin-1' });
        }),
      },
      refreshToken: {
        updateMany: jest.fn().mockImplementation(() => {
          calls.push('revoke-tokens');
          return Promise.resolve({ count: 2 });
        }),
      },
    };
    const prisma = {
      admin: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1' }) },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = new UsersService(prisma as any);

    await service.resetPassword('admin-1', { password: 'NewPassw0rd!' } as any);

    expect(calls).toEqual(['lock', 'update-password', 'revoke-tokens']);
    expect(tx.admin.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'admin-1' }, data: { password: 'new-hash' } }),
    );
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { adminId: 'admin-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
