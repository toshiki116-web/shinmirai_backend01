import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitQueryDto } from './dto/unit-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: UnitQueryDto) {
    const where: Prisma.UnitWhereInput = {
      status: { not: 'deleted' },
    };

    if (query.keyword) {
      where.OR = [
        { unitId: { contains: query.keyword, mode: 'insensitive' } },
        { pcUuid: { contains: query.keyword, mode: 'insensitive' } },
        { unitName: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    if (query.siteId) {
      where.siteId = query.siteId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          site: { select: { siteId: true, siteName: true } },
        },
      }),
      this.prisma.unit.count({ where }),
    ]);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(unitId: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { unitId },
      include: {
        site: { select: { siteId: true, siteName: true } },
        deviceAlerts: {
          orderBy: { occurredAt: 'desc' },
          take: 10,
        },
        deviceLogs: {
          orderBy: { occurredAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!unit || unit.status === 'deleted') {
      throw new NotFoundException(`筐体 ${unitId} が見つかりません`);
    }

    return unit;
  }

  async create(dto: CreateUnitDto) {
    await this.ensureSiteExists(dto.siteId);

    // device_tokenを自動生成（作成時のレスポンスにのみ含める）
    const deviceToken = randomUUID();

    const unit = await this.prisma.unit.create({
      data: {
        siteId: dto.siteId,
        unitName: dto.unitName,
        connectionMode: dto.connectionMode ?? 'online',
        deviceToken,
      },
    });

    return {
      ...unit,
      // 作成時のみdevice_tokenを明示的に返却（以降はAPIで取得不可）
      deviceToken,
    };
  }

  async update(unitId: string, dto: UpdateUnitDto) {
    await this.ensureExists(unitId);
    if (dto.siteId) {
      await this.ensureSiteExists(dto.siteId);
    }

    return this.prisma.unit.update({
      where: { unitId },
      data: {
        siteId: dto.siteId,
        unitName: dto.unitName,
        connectionMode: dto.connectionMode,
      },
    });
  }

  /** 論理削除 */
  async remove(unitId: string) {
    await this.ensureExists(unitId);

    return this.prisma.unit.update({
      where: { unitId },
      data: { status: 'deleted' },
    });
  }

  private async ensureExists(unitId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { unitId } });
    if (!unit || unit.status === 'deleted') {
      throw new NotFoundException(`筐体 ${unitId} が見つかりません`);
    }
    return unit;
  }

  private async ensureSiteExists(siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { siteId } });
    if (!site || site.status === 'deleted') {
      throw new NotFoundException(`拠点 ${siteId} が見つかりません`);
    }
    return site;
  }
}
