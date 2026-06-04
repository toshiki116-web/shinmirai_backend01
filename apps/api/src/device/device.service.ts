import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const ContentUploadStatus = {
  READY: 'ready',
} as const;
import { ActivateDto } from './dto/activate.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { CreateAlertDto } from './dto/alert.dto';
import { DailyAnalyticsDto } from './dto/analytics.dto';
import { SendLogsDto } from './dto/send-logs.dto';

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

  /** 拠点・筐体マスタ取得（初期設定用） */
  async getMasterSitesUnits() {
    const sites = await this.prisma.site.findMany({
      where: { status: { not: 'deleted' } },
      select: {
        siteId: true,
        siteName: true,
        units: {
          where: { status: { not: 'deleted' } },
          select: { unitId: true, unitName: true },
        },
      },
      orderBy: { siteName: 'asc' },
    });

    return { sites };
  }

  /** 筐体紐付け登録 */
  async activate(device: UnitWithSite, dto: ActivateDto) {
    // 既にpc_uuidが設定済みの場合はエラー
    if (device.pcUuid) {
      throw new ConflictException('この筐体は既に紐付け済みです。管理画面から解除してください');
    }

    const updated = await this.prisma.unit.update({
      where: { unitId: device.unitId },
      data: {
        siteId: dto.siteId,
        pcUuid: dto.pcUuid,
      },
    });

    this.logger.log(`筐体紐付け完了: ${device.unitId} -> 拠点:${dto.siteId}, PC:${dto.pcUuid}`);

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
        { deliveryType: 'general' },
        {
          deliveryType: 'limited',
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
        filePath: true,
        version: true,
        checksum: true,
      },
    });

    return {
      items: contents.map((c) => ({
        contentId: c.contentId,
        contentName: c.contentName,
        statusCategory: c.statusCategory,
        downloadUrl: c.filePath ? this.storageService.signContentUrl(c.filePath) : null,
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

  /** ログ一括送信 */
  async sendLogs(device: UnitWithSite, dto: SendLogsDto) {
    const createdCount = await this.prisma.deviceLog.createMany({
      data: dto.logs.map((log) => ({
        unitId: device.unitId,
        logType: dto.logType,
        level: log.level,
        message: log.message,
        occurredAt: new Date(log.timestamp),
      })),
    });

    return { receivedCount: createdCount.count };
  }
}
