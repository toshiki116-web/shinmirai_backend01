import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { SiteQueryDto } from './dto/site-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: SiteQueryDto) {
    const where: Prisma.SiteWhereInput = {
      // 論理削除済みは除外
      status: { not: 'deleted' },
    };

    // キーワード検索（拠点名 or 拠点ID）
    if (query.keyword) {
      where.OR = [
        { siteName: { contains: query.keyword, mode: 'insensitive' } },
        { siteId: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    // ステータス絞り込み
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.site.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          // 詳細画面と件数を一致させるため、論理削除済み筐体はカウントから除外する
          _count: { select: { units: { where: { status: { not: 'deleted' } } } } },
        },
      }),
      this.prisma.site.count({ where }),
    ]);

    // レスポンス形式を仕様書に合わせる
    return {
      items: items.map((site) => ({
        ...site,
        unitCount: site._count.units,
        _count: undefined,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { siteId },
      include: {
        units: {
          where: { status: { not: 'deleted' } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!site || site.status === 'deleted') {
      throw new NotFoundException(`拠点 ${siteId} が見つかりません`);
    }

    return site;
  }

  async create(dto: CreateSiteDto) {
    return this.prisma.site.create({
      data: {
        siteName: dto.siteName,
        address: dto.address,
        phoneNumber: dto.phoneNumber,
        note: dto.note,
      },
    });
  }

  async update(siteId: string, dto: UpdateSiteDto) {
    await this.ensureExists(siteId);

    return this.prisma.site.update({
      where: { siteId },
      data: {
        siteName: dto.siteName,
        address: dto.address,
        phoneNumber: dto.phoneNumber,
        note: dto.note,
      },
    });
  }

  /** 論理削除 */
  async remove(siteId: string) {
    await this.ensureExists(siteId);

    return this.prisma.site.update({
      where: { siteId },
      data: { status: 'deleted' },
    });
  }

  private async ensureExists(siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { siteId } });
    if (!site || site.status === 'deleted') {
      throw new NotFoundException(`拠点 ${siteId} が見つかりません`);
    }
    return site;
  }
}
