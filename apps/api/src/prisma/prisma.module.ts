import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** PrismaServiceをアプリ全体で利用可能にするグローバルモジュール */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
