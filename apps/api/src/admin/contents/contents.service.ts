import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { ContentQueryDto } from './dto/content-query.dto';
import { AssignSitesDto } from './dto/assign-sites.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ContentsService {
  private readonly logger = new Logger(ContentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ContentQueryDto) {
    const where: Prisma.ContentWhereInput = {
      isActive: true,
    };

    if (query.keyword) {
      where.OR = [
        { contentName: { contains: query.keyword, mode: 'insensitive' } },
        { contentId: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    if (query.statusCategory) {
      where.statusCategory = query.statusCategory;
    }

    if (query.deliveryType) {
      where.deliveryType = query.deliveryType;
    }

    if (query.language) {
      where.language = query.language;
    }

    const [items, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { contentSiteAssignments: true } },
        },
      }),
      this.prisma.content.count({ where }),
    ]);

    return {
      items: items.map((content) => ({
        ...content,
        // BigIntはJSONシリアライズでエラーになるため文字列変換
        fileSize: content.fileSize?.toString() ?? null,
        assignedSiteCount: content._count.contentSiteAssignments,
        _count: undefined,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(contentId: string) {
    const content = await this.prisma.content.findUnique({
      where: { contentId },
      include: {
        contentSiteAssignments: {
          include: {
            site: { select: { siteId: true, siteName: true } },
          },
        },
      },
    });

    if (!content || !content.isActive) {
      throw new NotFoundException(`コンテンツ ${contentId} が見つかりません`);
    }

    return {
      ...content,
      fileSize: content.fileSize?.toString() ?? null,
      assignedSites: content.contentSiteAssignments.map((a) => a.site),
      contentSiteAssignments: undefined,
    };
  }

  async create(dto: CreateContentDto) {
    const content = await this.prisma.content.create({
      data: {
        contentName: dto.contentName,
        language: dto.language ?? 'ja',
        deliveryType: dto.deliveryType ?? 'general',
        statusCategory: dto.statusCategory ?? 'status1',
        // 拠点割り当て（指定があれば）
        ...(dto.siteIds && dto.siteIds.length > 0
          ? {
              contentSiteAssignments: {
                create: dto.siteIds.map((siteId) => ({ siteId })),
              },
            }
          : {}),
      },
      include: {
        contentSiteAssignments: {
          include: { site: { select: { siteId: true, siteName: true } } },
        },
      },
    });

    return {
      ...content,
      fileSize: content.fileSize?.toString() ?? null,
      assignedSites: content.contentSiteAssignments.map((a) => a.site),
    };
  }

  async update(contentId: string, dto: UpdateContentDto) {
    await this.ensureExists(contentId);

    // 拠点割り当ての更新が含まれる場合はトランザクションで処理
    if (dto.siteIds !== undefined) {
      return this.prisma.$transaction(async (tx) => {
        // 既存割り当てを全削除
        await tx.contentSiteAssignment.deleteMany({ where: { contentId } });

        // 新しい割り当てを作成
        if (dto.siteIds!.length > 0) {
          await tx.contentSiteAssignment.createMany({
            data: dto.siteIds!.map((siteId) => ({ contentId, siteId })),
          });
        }

        // コンテンツ本体を更新
        return tx.content.update({
          where: { contentId },
          data: {
            contentName: dto.contentName,
            language: dto.language,
            deliveryType: dto.deliveryType,
            statusCategory: dto.statusCategory,
          },
        });
      });
    }

    return this.prisma.content.update({
      where: { contentId },
      data: {
        contentName: dto.contentName,
        language: dto.language,
        deliveryType: dto.deliveryType,
        statusCategory: dto.statusCategory,
      },
    });
  }

  /** 論理削除（is_active=false） */
  async remove(contentId: string) {
    await this.ensureExists(contentId);

    return this.prisma.content.update({
      where: { contentId },
      data: { isActive: false },
    });
  }

  /** 拠点割り当て（既存を置換） */
  async assignSites(contentId: string, dto: AssignSitesDto) {
    await this.ensureExists(contentId);

    await this.prisma.$transaction(async (tx) => {
      await tx.contentSiteAssignment.deleteMany({ where: { contentId } });
      await tx.contentSiteAssignment.createMany({
        data: dto.siteIds.map((siteId) => ({ contentId, siteId })),
      });
    });

    this.logger.log(`コンテンツ ${contentId} の配信対象拠点を更新: ${dto.siteIds.join(', ')}`);

    return { contentId, assignedSiteIds: dto.siteIds };
  }

  /**
   * ファイルアップロード後のメタデータ更新
   * TODO(2026-04-06): Phase 2でS3連携実装時にStorageServiceと統合
   */
  async updateFileMetadata(
    contentId: string,
    metadata: { filePath: string; fileSize: bigint; checksum: string },
  ) {
    await this.ensureExists(contentId);

    return this.prisma.content.update({
      where: { contentId },
      data: {
        filePath: metadata.filePath,
        fileSize: metadata.fileSize,
        checksum: metadata.checksum,
        version: { increment: 1 },
      },
    });
  }

  private async ensureExists(contentId: string) {
    const content = await this.prisma.content.findUnique({ where: { contentId } });
    if (!content || !content.isActive) {
      throw new NotFoundException(`コンテンツ ${contentId} が見つかりません`);
    }
    return content;
  }
}
