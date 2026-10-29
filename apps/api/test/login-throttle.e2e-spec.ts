import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
// @types/supertest は未導入（新規依存を足さない方針）のため require で読み込む
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import {
  AppModule,
  LOGIN_THROTTLE_LIMIT,
  LOGIN_THROTTLE_MESSAGE,
} from '../src/app.module';
import { GlobalHttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

// DB を使わず、制限の挙動だけを確認する（存在しないメールアドレスのログインは常に 401）
const prismaStub = {
  admin: { findUnique: jest.fn().mockResolvedValue(null) },
  refreshToken: { findUnique: jest.fn().mockResolvedValue(null) },
  onModuleInit: jest.fn(),
  onModuleDestroy: jest.fn(),
};

describe('ログイン試行回数の制限', () => {
  let app: INestApplication;

  const login = (xff: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', xff)
      .send({ email: 'nobody@example.com', password: 'wrong-password' });

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
    // main.ts と同じ設定
    nestApp.set('trust proxy', 1);
    nestApp.setGlobalPrefix('api');
    nestApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    nestApp.useGlobalFilters(new GlobalHttpExceptionFilter());
    nestApp.useGlobalInterceptors(new TransformInterceptor());
    await nestApp.init();
    app = nestApp;
  });

  afterAll(async () => {
    await app.close();
  });

  it('同じIPで11回目に429になり、日本語メッセージを返す。別IPは別カウント', async () => {
    for (let i = 1; i <= LOGIN_THROTTLE_LIMIT; i++) {
      const res = await login('203.0.113.10');
      expect(res.status).toBe(401);
    }

    const blocked = await login('203.0.113.10');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error_code).toBe('TOO_MANY_REQUESTS');
    expect(blocked.body.message).toBe(LOGIN_THROTTLE_MESSAGE);

    const otherIp = await login('203.0.113.11');
    expect(otherIp.status).toBe(401);
  });

  it('refresh は制限の対象外（30回でも429にならない）', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('X-Forwarded-For', '203.0.113.20')
        .send({ refresh_token: 'invalid' });
      expect(res.status).toBe(401);
    }
  });
});
