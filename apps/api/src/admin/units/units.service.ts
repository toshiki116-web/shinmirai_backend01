import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UpdateLicenseDto } from './dto/update-license.dto';
import { UnitQueryDto } from './dto/unit-query.dto';
import { Prisma } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { StorageService } from '../../storage/storage.service';

@Injectable()
export class UnitsService {
  private readonly logger = new Logger(UnitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

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
        deviceLogFiles: {
          orderBy: { uploadedAt: 'desc' },
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

  async update(unitId: string, dto: UpdateUnitDto, actorId: string) {
    if (dto.siteId === null) {
      throw new BadRequestException('siteId を null にはできません（未割当化は非対応）');
    }

    const existing = await this.ensureExists(unitId);
    if (dto.siteId) {
      await this.ensureSiteExists(dto.siteId);
    }

    const siteChanged = dto.siteId !== undefined && dto.siteId !== existing.siteId;

    const updated = await this.prisma.unit.update({
      where: { unitId },
      data: {
        siteId: dto.siteId,
        unitName: dto.unitName,
        connectionMode: dto.connectionMode,
      },
    });

    if (siteChanged) {
      this.logger.log(
        `筐体拠点変更: who=${actorId} unit=${unitId} ` +
          `oldSiteId=${existing.siteId ?? 'なし'} newSiteId=${dto.siteId} ` +
          `(紐付け済み=${!!updated.pcUuid})`,
      );
    }

    return updated;
  }

  async updateLicense(unitId: string, dto: UpdateLicenseDto) {
    await this.ensureExists(unitId);

    return this.prisma.unit.update({
      where: { unitId },
      data: {
        licenseStatus: dto.licenseStatus,
        licenseExpiredAt: dto.licenseExpiredAt ? new Date(dto.licenseExpiredAt) : null,
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

  async findLogFiles(unitId: string, query: PaginationDto) {
    await this.ensureExists(unitId);

    const where: Prisma.DeviceLogFileWhereInput = { unitId };
    const [items, total] = await Promise.all([
      this.prisma.deviceLogFile.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { uploadedAt: 'desc' },
        select: {
          logFileId: true,
          fileName: true,
          fileSize: true,
          contentType: true,
          uploadedAt: true,
        },
      }),
      this.prisma.deviceLogFile.count({ where }),
    ]);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async createLogDownloadUrl(unitId: string, logFileId: string) {
    await this.ensureExists(unitId);

    const logFile = await this.prisma.deviceLogFile.findFirst({
      where: { unitId, logFileId },
    });
    if (!logFile) {
      throw new NotFoundException(`Log file ${logFileId} not found`);
    }
    if (!logFile.s3Key.startsWith(`logs/${unitId}/`)) {
      throw new BadRequestException('Log file key does not match the unit');
    }

    return this.storageService.createLogDownloadUrl(logFile.s3Key, logFile.fileName);
  }

  private async ensureSiteExists(siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { siteId } });
    if (!site || site.status === 'deleted') {
      throw new NotFoundException(`拠点 ${siteId} が見つかりません`);
    }
    return site;
  }
}
