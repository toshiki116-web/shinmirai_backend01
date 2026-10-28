import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthModule } from './health/health.module';
import { SitesModule } from './admin/sites/sites.module';
import { UnitsModule } from './admin/units/units.module';
import { ContentsModule } from './admin/contents/contents.module';
import { UsersModule } from './admin/users/users.module';
import { DeviceModule } from './device/device.module';
import { StorageModule } from './storage/storage.module';

export const LOGIN_THROTTLE_TTL_MS = 60_000;
export const LOGIN_THROTTLE_LIMIT = 10;
export const LOGIN_THROTTLE_MESSAGE =
  'ログイン試行回数が上限に達しました。しばらくしてから再度お試しください';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // TODO(2026-10-28): 簡易実装 — タスク数N台なら実効上限はN倍。厳密化はRedis等の共有ストア
    // APP_GUARDには登録しない（login のみ @UseGuards で制限する）
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'login', ttl: LOGIN_THROTTLE_TTL_MS, limit: LOGIN_THROTTLE_LIMIT }],
      errorMessage: LOGIN_THROTTLE_MESSAGE,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    SitesModule,
    UnitsModule,
    ContentsModule,
    UsersModule,
    DeviceModule,
    StorageModule,
  ],
  providers: [
    // JWT認証をグローバルに適用（@Public()で除外可能）
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
