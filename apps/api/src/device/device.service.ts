import { BadRequestException, Injectable, ConflictException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContentThumbnailStatus, ContentUploadStatus, DeliveryType } from '@sinmirai/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ActivateDto } from './dto/activate.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { CreateAlertDto } from './dto/alert.dto';
import { DailyAnalyticsDto } from './dto/analytics.dto';
import { CreateLogUploadUrlDto } from './dto/create-log-upload-url.dto';
import { CompleteLogUploadDto } from './dto/complete-log-upload.dto';

// Prismaが生成するUnit型を使用
type UnitWithSite = {
  unitId: string;
  siteId: string | null;
  unitName: string;
  pcUuid: string | null;
  deviceToken: string | null;
  connectionMode: string;
  status: string;
  licenseStatus: string;
  licenseExpiredAt: Date | null;
  site: { siteId: string; siteName: string } | null;
};

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /** 筐体紐付け登録 */
  async activate(device: UnitWithSite, dto: ActivateDto) {
    // 既にpc_uuidが設定済みの場合はエラー
    if (device.pcUuid) {
      throw new ConflictException('この筐体は既に紐付け済みです。管理画面から解除してください');
    }
    if (!device.siteId) {
      throw new BadRequestException('この筐体は拠点が未割当です。管理画面で拠点を割り当ててください');
    }

    const updated = await this.prisma.unit.update({
      where: { unitId: device.unitId },
      data: { pcUuid: dto.pcUuid },
    });

    this.logger.log(`筐体紐付け完了: ${device.unitId} -> 拠点:${device.siteId}, PC:${dto.pcUuid}`);

    return {
      unitId: updated.unitId,
      siteId: updated.siteId,
      pcUuid: updated.pcUuid,
      deviceToken: updated.deviceToken,
    };
  }

  /** 配信コンテンツ一覧取得 */
  async getContents(device: UnitWithSite, language?: string) {
    if (!device.siteId) {
      return { items: [] };
    }

    const where: Prisma.ContentWhereInput = {
      isActive: true,
      uploadStatus: ContentUploadStatus.READY,
      filePath: { not: null },
      OR: [
        { deliveryType: DeliveryType.GENERAL },
        {
          deliveryType: DeliveryType.LIMITED,
          contentSiteAssignments: {
            some: { siteId: device.siteId },
          },
        },
      ],
    };

    if (language) {
      where.language = language;
    }

    const contents = await this.prisma.content.findMany({
      where,
      select: {
        contentId: true,
        contentName: true,
        statusCategory: true,
        deliveryType: true,
        filePath: true,
        thumbnailPath: true,
        thumbnailStatus: true,
        version: true,
        checksum: true,
      },
    });

    return {
      items: contents.map((c) => ({
        contentId: c.contentId,
        contentName: c.contentName,
        statusCategory: c.statusCategory,
        deliveryType: c.deliveryType,
        downloadUrl: c.filePath ? this.storageService.signContentUrl(c.filePath) : null,
        thumbnailUrl:
          c.thumbnailPath && c.thumbnailStatus === ContentThumbnailStatus.READY
            ? this.storageService.signContentUrl(c.thumbnailPath)
            : null,
        version: c.version,
        checksum: c.checksum,
      })),
    };
  }

  /** ライセンス確認 */
  async checkLicense(device: UnitWithSite) {
    const isValid =
      device.licenseStatus === 'valid' &&
      (!device.licenseExpiredAt || device.licenseExpiredAt > new Date());

    return {
      licenseValid: isValid,
      expiredAt: device.licenseExpiredAt?.toISOString() ?? null,
      plan: 'standard',
    };
  }

  /** 稼働状況送信 */
  async sendHeartbeat(device: UnitWithSite, dto: HeartbeatDto) {
    await this.prisma.unit.update({
      where: { unitId: device.unitId },
      data: {
        status: dto.status,
        lastSeenAt: new Date(dto.sentAt),
      },
    });

    return { received: true };
  }

  /** アラート送信 */
  async sendAlert(device: UnitWithSite, dto: CreateAlertDto) {
    const alert = await this.prisma.deviceAlert.create({
      data: {
        unitId: device.unitId,
        alertType: dto.alertType,
        deviceName: dto.deviceName,
        detail: dto.detail,
        level: dto.level,
        occurredAt: new Date(dto.occurredAt),
      },
    });

    // アラートレベルに応じて筐体のalertMessageを更新
    if (dto.level === 'error' || dto.level === 'critical') {
      await this.prisma.unit.update({
        where: { unitId: device.unitId },
        data: {
          alertMessage: `${dto.alertType}: ${dto.detail ?? dto.deviceName ?? ''}`,
          status: 'warning',
        },
      });
    }

    this.logger.warn(`アラート受信: ${device.unitId} [${dto.level}] ${dto.alertType}`);

    return { alertId: alert.id };
  }

  /** 日次利用回数送信（UPSERT） */
  async sendDailyAnalytics(device: UnitWithSite, dto: DailyAnalyticsDto) {
    const targetDate = new Date(dto.targetDate);

    await this.prisma.dailyAnalytics.upsert({
      where: {
        unitId_targetDate: {
          unitId: device.unitId,
          targetDate,
        },
      },
      update: { useCount: dto.useCount },
      create: {
        unitId: device.unitId,
        targetDate,
        useCount: dto.useCount,
      },
    });

    return { received: true };
  }

  async createLogUploadUrl(device: UnitWithSite, dto: CreateLogUploadUrlDto) {
    return this.storageService.createLogUploadUrl({
      unitId: device.unitId,
      fileName: dto.fileName,
      contentType: dto.contentType,
      fileSize: dto.fileSize,
    });
  }

  async completeLogUpload(device: UnitWithSite, dto: CompleteLogUploadDto) {
    const fileName = this.storageService.validateLogFileName(dto.fileName);
    const expectedObjectKey = this.storageService.buildLogObjectKey(device.unitId, fileName);
    if (dto.objectKey !== expectedObjectKey) {
      throw new BadRequestException('Log object key does not match the authenticated unit');
    }

    let head;
    try {
      head = await this.storageService.headLogObject(dto.objectKey);
    } catch (err) {
      throw new BadRequestException('Uploaded log file could not be confirmed');
    }

    try {
      this.storageService.validateLogUpload(head.contentType, Number(head.fileSize));
    } catch (err) {
      try {
        await this.storageService.deleteLogObject(dto.objectKey);
      } catch (deleteErr) {
        this.logger.warn(`Failed to delete invalid log object: ${dto.objectKey}`);
      }
      throw err;
    }

    const contentType = head.contentType
      ? this.storageService.normalizeContentType(head.contentType)
      : null;
    const now = new Date();
    const logFile = await this.prisma.deviceLogFile.upsert({
      where: { s3Key: dto.objectKey },
      update: {
        unitId: device.unitId,
        fileName,
        fileSize: Number(head.fileSize),
        contentType,
        checksum: dto.checksum ?? head.checksum,
        uploadedAt: now,
      },
      create: {
        unitId: device.unitId,
        fileName,
        s3Key: dto.objectKey,
        fileSize: Number(head.fileSize),
        contentType,
        checksum: dto.checksum ?? head.checksum,
        uploadedAt: now,
      },
    });

    return {
      logFileId: logFile.logFileId,
      receivedAt: logFile.uploadedAt,
    };
  }
}
