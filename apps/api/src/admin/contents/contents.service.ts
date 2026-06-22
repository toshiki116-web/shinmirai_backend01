import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Content, Prisma } from '@prisma/client';
import { ContentThumbnailStatus, ContentUploadStatus } from '@sinmirai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AssignSitesDto } from './dto/assign-sites.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CompleteThumbnailUploadDto } from './dto/complete-thumbnail-upload.dto';
import { ContentQueryDto } from './dto/content-query.dto';
import { CreateContentDto } from './dto/create-content.dto';
import { CreateThumbnailUrlDto } from './dto/create-thumbnail-url.dto';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@Injectable()
export class ContentsService {
  private readonly logger = new Logger(ContentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

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
        ...this.serializeContent(content),
        assignedSiteCount: content._count.contentSiteAssignments,
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
      ...this.serializeContent(content),
      thumbnailUrl:
        content.thumbnailPath && content.thumbnailStatus === ContentThumbnailStatus.READY
          ? this.storageService.signContentUrl(content.thumbnailPath)
          : null,
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
      ...this.serializeContent(content),
      assignedSites: content.contentSiteAssignments.map((a) => a.site),
      contentSiteAssignments: undefined,
    };
  }

  async update(contentId: string, dto: UpdateContentDto) {
    await this.ensureExists(contentId);

    if (dto.siteIds !== undefined) {
      const content = await this.prisma.$transaction(async (tx) => {
        await tx.contentSiteAssignment.deleteMany({ where: { contentId } });

        if (dto.siteIds!.length > 0) {
          await tx.contentSiteAssignment.createMany({
            data: dto.siteIds!.map((siteId) => ({ contentId, siteId })),
          });
        }

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
      return this.serializeContent(content);
    }

    const content = await this.prisma.content.update({
      where: { contentId },
      data: {
        contentName: dto.contentName,
        language: dto.language,
        deliveryType: dto.deliveryType,
        statusCategory: dto.statusCategory,
      },
    });
    return this.serializeContent(content);
  }

  async remove(contentId: string) {
    await this.ensureExists(contentId);

    const content = await this.prisma.content.update({
      where: { contentId },
      data: { isActive: false },
    });
    return this.serializeContent(content);
  }

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

  async createUploadUrl(contentId: string, dto: CreateUploadUrlDto) {
    await this.ensureExists(contentId);
    const result = await this.storageService.createUploadUrl({
      contentId,
      fileName: dto.fileName,
      contentType: dto.contentType,
      fileSize: dto.fileSize,
    });

    await this.prisma.content.update({
      where: { contentId },
      data: {
        filePath: result.objectKey,
        fileSize: BigInt(dto.fileSize),
        checksum: null,
        mimeType: dto.contentType,
        uploadStatus: ContentUploadStatus.UPLOADING,
      },
    });

    return result;
  }

  async completeUpload(contentId: string, dto: CompleteUploadDto) {
    const content = await this.ensureExists(contentId);
    if (content.filePath && content.filePath !== dto.objectKey) {
      throw new BadRequestException('アップロード対象のファイルキーが一致しません');
    }

    try {
      const head = await this.storageService.headObject(dto.objectKey);
      return this.updateFileMetadata(contentId, {
        filePath: dto.objectKey,
        fileSize: head.fileSize,
        checksum: dto.checksum ?? head.checksum,
        mimeType: head.contentType ?? content.mimeType,
        uploadStatus: ContentUploadStatus.READY,
      });
    } catch (err) {
      await this.prisma.content.update({
        where: { contentId },
        data: { uploadStatus: ContentUploadStatus.FAILED },
      });
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException('アップロード済みファイルを確認できません');
    }
  }

  async createThumbnailUploadUrl(contentId: string, dto: CreateThumbnailUrlDto) {
    await this.ensureExists(contentId);
    const result = await this.storageService.createThumbnailUploadUrl({
      contentId,
      fileName: dto.fileName,
      contentType: dto.contentType,
      fileSize: dto.fileSize,
    });

    await this.prisma.content.update({
      where: { contentId },
      data: {
        thumbnailPath: result.objectKey,
        thumbnailMimeType: this.storageService.normalizeImageContentType(dto.contentType),
        thumbnailStatus: ContentThumbnailStatus.UPLOADING,
      },
    });

    return result;
  }

  async completeThumbnailUpload(contentId: string, dto: CompleteThumbnailUploadDto) {
    const content = await this.ensureExists(contentId);

    const expectedPrefix = `contents/${contentId}/thumbnails/`;
    if (!dto.objectKey.startsWith(expectedPrefix)) {
      throw new BadRequestException('サムネイルのファイルキーが不正です');
    }
    if (content.thumbnailPath && content.thumbnailPath !== dto.objectKey) {
      throw new BadRequestException('サムネイルのファイルキーが一致しません');
    }

    try {
      const head = await this.storageService.headObject(dto.objectKey);
      if (!head.contentType) {
        throw new BadRequestException('サムネイルのContent-Typeを確認できません');
      }
      const contentType = this.storageService.normalizeImageContentType(head.contentType);
      this.storageService.validateImageUpload(contentType, Number(head.fileSize));

      const updated = await this.prisma.content.update({
        where: { contentId },
        data: {
          thumbnailPath: dto.objectKey,
          thumbnailMimeType: contentType,
          thumbnailStatus: ContentThumbnailStatus.READY,
        },
      });
      return this.serializeContent(updated);
    } catch (err) {
      await this.prisma.content.update({
        where: { contentId },
        data: { thumbnailStatus: ContentThumbnailStatus.FAILED },
      });
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException('アップロード済みサムネイルを確認できません');
    }
  }

  async removeThumbnail(contentId: string) {
    await this.ensureExists(contentId);

    const content = await this.prisma.content.update({
      where: { contentId },
      data: {
        thumbnailPath: null,
        thumbnailMimeType: null,
        thumbnailStatus: ContentThumbnailStatus.NONE,
      },
    });
    return this.serializeContent(content);
  }

  async updateFileMetadata(
    contentId: string,
    metadata: {
      filePath: string;
      fileSize: bigint;
      checksum: string | null;
      mimeType: string | null;
      uploadStatus: string;
    },
  ) {
    await this.ensureExists(contentId);

    const content = await this.prisma.content.update({
      where: { contentId },
      data: {
        filePath: metadata.filePath,
        fileSize: metadata.fileSize,
        checksum: metadata.checksum,
        mimeType: metadata.mimeType,
        uploadStatus: metadata.uploadStatus,
        version: { increment: 1 },
      },
    });
    return this.serializeContent(content);
  }

  private async ensureExists(contentId: string) {
    const content = await this.prisma.content.findUnique({ where: { contentId } });
    if (!content || !content.isActive) {
      throw new NotFoundException(`コンテンツ ${contentId} が見つかりません`);
    }
    return content;
  }

  private serializeContent(content: Content) {
    return {
      ...content,
      fileSize: content.fileSize?.toString() ?? null,
    };
  }
}
