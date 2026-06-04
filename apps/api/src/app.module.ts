import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
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
