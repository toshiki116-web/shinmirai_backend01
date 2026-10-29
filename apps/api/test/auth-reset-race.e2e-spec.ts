import { TestingModule, Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/admin/users/users.service';
import { PrismaService } from '../src/prisma/prisma.service';

// login の bcrypt.compare を「本物の結果を返した後、ゲートが開くまで止める」ために差し替える。
// hash は本物のまま。jest.spyOn は esModuleInterop のコピーを参照するため届かない
const mockHooks: { afterCompare: (() => Promise<void>) | null } = { afterCompare: null };
jest.mock('bcrypt', () => {
  const actual = jest.requireActual('bcrypt');
  return {
    ...actual,
    compare: async (...args: unknown[]) => {
      const result = await actual.compare(...args);
      if (mockHooks.afterCompare) await mockHooks.afterCompare();
      return result;
    },
  };
});

// 本番DBに絶対に接続しないよう、ローカルの docker compose の PostgreSQL（5433番）に固定する
const LOCAL_DATABASE_URL =
  process.env.RACE_TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/sinmirai_race_test';
const PAUSE_TIMEOUT_MS = 5000;
const EMAIL_PREFIX = 'race-test-';
const OLD_PASSWORD = 'OldPassw0rd!';
const NEW_PASSWORD = 'NewPassw0rd!';

function createGate() {
  let release!: () => void;
  let reach!: () => void;
  const opened = new Promise<void>((resolve) => (release = resolve));
  const reached = new Promise<void>((resolve) => (reach = resolve));
  // 一時停止の位置に到達しないままテストが通ることを防ぐ
  const waitReached = () =>
    Promise.race([
      reached,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('一時停止の位置に到達しませんでした')), PAUSE_TIMEOUT_MS),
      ),
    ]);
  const pause = async () => {
    reach();
    await opened;
  };
  return { release, waitReached, pause };
}

describe('パスワードリセットとトークン発行の競合（実DB）', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let authService: AuthService;
  let usersService: UsersService;
  let adminId: string;
  let email: string;
  let sequence = 0;

  const unrevokedCount = () => prisma.refreshToken.count({ where: { adminId, revokedAt: null } });

  const expectUnauthorized = (result: PromiseSettledResult<unknown>) => {
    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason).toBeInstanceOf(UnauthorizedException);
  };

  beforeAll(async () => {
    expect(LOCAL_DATABASE_URL).toMatch(/@(localhost|127\.0\.0\.1):5433\//);
    process.env.DATABASE_URL = LOCAL_DATABASE_URL;
    process.env.JWT_SECRET = 'test-secret';

    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);
    usersService = moduleRef.get(UsersService);
  });

  afterAll(async () => {
    await prisma.admin.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
    await moduleRef.close();
  });

  beforeEach(async () => {
    sequence += 1;
    email = `${EMAIL_PREFIX}${Date.now()}-${sequence}@example.com`;
    const admin = await prisma.admin.create({
      data: {
        email,
        password: await bcrypt.hash(OLD_PASSWORD, 4),
        name: 'race test',
        role: 'master',
        isActive: true,
      },
    });
    adminId = admin.id;
  });

  afterEach(() => {
    mockHooks.afterCompare = null;
    jest.restoreAllMocks();
  });

  it('refresh × reset: refresh が最初の読み取りで止まっている間にリセットが完了したら、refresh は 401', async () => {
    const { refresh_token } = await authService.login({ email, password: OLD_PASSWORD });

    const gate = createGate();
    const original = prisma.refreshToken.findUnique.bind(prisma.refreshToken);
    jest.spyOn(prisma.refreshToken, 'findUnique').mockImplementation(((...args: unknown[]) =>
      (original as (...a: unknown[]) => Promise<unknown>)(...args).then(async (row) => {
        await gate.pause();
        return row;
      })) as never);

    const refreshPromise = authService.refresh(refresh_token);
    await gate.waitReached();

    const [resetResult] = await Promise.allSettled([
      usersService.resetPassword(adminId, { password: NEW_PASSWORD }),
    ]);
    gate.release();
    const [refreshResult] = await Promise.allSettled([refreshPromise]);

    expect(resetResult.status).toBe('fulfilled');
    expectUnauthorized(refreshResult);
    expect(await unrevokedCount()).toBe(0);
  });

  it('login × reset: bcrypt 照合の直後に止まっている間にリセットが完了したら、login は 401', async () => {
    const gate = createGate();
    mockHooks.afterCompare = () => gate.pause();

    const loginPromise = authService.login({ email, password: OLD_PASSWORD });
    await gate.waitReached();

    mockHooks.afterCompare = null;
    const [resetResult] = await Promise.allSettled([
      usersService.resetPassword(adminId, { password: NEW_PASSWORD }),
    ]);
    gate.release();
    const [loginResult] = await Promise.allSettled([loginPromise]);

    expect(resetResult.status).toBe('fulfilled');
    expectUnauthorized(loginResult);
    expect(await unrevokedCount()).toBe(0);
  });

  it('同じリフレッシュトークンの同時二重 refresh は 1 つだけ成功する', async () => {
    const { refresh_token } = await authService.login({ email, password: OLD_PASSWORD });

    const results = await Promise.allSettled([
      authService.refresh(refresh_token),
      authService.refresh(refresh_token),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expectUnauthorized(results.find((r) => r.status === 'rejected')!);
    expect(await unrevokedCount()).toBe(1);
  });

  it('リセット後に旧リフレッシュトークンで refresh すると 401', async () => {
    const { refresh_token } = await authService.login({ email, password: OLD_PASSWORD });

    await usersService.resetPassword(adminId, { password: NEW_PASSWORD });
    const [refreshResult] = await Promise.allSettled([authService.refresh(refresh_token)]);

    expectUnauthorized(refreshResult);
    expect(await unrevokedCount()).toBe(0);
  });

  // テスト側が admins 行の FOR NO KEY UPDATE を握っている間、各操作が待たされる（FOR UPDATE を取っている）ことの確認。
  // FOR UPDATE だと refresh_tokens の外部キー検査（FOR KEY SHARE）も待たされ、行ロックの有無を区別できないため弱いロックを使う
  describe('admins 行ロックの待ち合わせ', () => {
    const WAIT_CHECK_MS = 1000;

    async function holdAdminLock() {
      const gate = createGate();
      const held = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM admins WHERE id = ${adminId} FOR NO KEY UPDATE`;
          await gate.pause();
        },
        { timeout: 30000 },
      );
      await gate.waitReached();
      return { release: gate.release, held };
    }

    const stateWithin = (operation: Promise<unknown>) =>
      Promise.race([
        operation.then(
          () => 'finished',
          () => 'finished',
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve('waiting'), WAIT_CHECK_MS)),
      ]);

    it('resetPassword はロック解放まで待ち、解放後に完了して未失効トークンを 0 にする', async () => {
      await authService.login({ email, password: OLD_PASSWORD });
      const lock = await holdAdminLock();

      const resetPromise = usersService.resetPassword(adminId, { password: NEW_PASSWORD });
      expect(await stateWithin(resetPromise)).toBe('waiting');

      lock.release();
      const [resetResult] = await Promise.allSettled([resetPromise]);
      await lock.held;
      expect(resetResult.status).toBe('fulfilled');
      expect(await unrevokedCount()).toBe(0);
    });

    it('login はロック解放まで待ち、解放後にトークンを 1 件作る', async () => {
      const lock = await holdAdminLock();

      const loginPromise = authService.login({ email, password: OLD_PASSWORD });
      expect(await stateWithin(loginPromise)).toBe('waiting');

      lock.release();
      const [loginResult] = await Promise.allSettled([loginPromise]);
      await lock.held;
      expect(loginResult.status).toBe('fulfilled');
      expect(await unrevokedCount()).toBe(1);
    });

    it('refresh はロック解放まで待ち、解放後に旧トークンを失効して新トークンを 1 件作る', async () => {
      const { refresh_token } = await authService.login({ email, password: OLD_PASSWORD });
      const lock = await holdAdminLock();

      const refreshPromise = authService.refresh(refresh_token);
      expect(await stateWithin(refreshPromise)).toBe('waiting');

      lock.release();
      const [refreshResult] = await Promise.allSettled([refreshPromise]);
      await lock.held;
      expect(refreshResult.status).toBe('fulfilled');
      expect(await unrevokedCount()).toBe(1);
    });
  });
});
