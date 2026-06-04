import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { SiteQueryDto } from './dto/site-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('拠点管理')
@ApiBearerAuth()
@Controller('admin/sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  @ApiOperation({ summary: '拠点一覧取得', description: 'ページネーション・キーワード検索・ステータス絞り込み対応' })
  @ApiResponse({ status: 200, description: '拠点一覧' })
  findAll(@Query() query: SiteQueryDto) {
    return this.sitesService.findAll(query);
  }

  @Get(':siteId')
  @ApiOperation({ summary: '拠点詳細取得', description: '拠点情報と紐付き筐体一覧を返却' })
  @ApiResponse({ status: 200, description: '拠点詳細' })
  @ApiResponse({ status: 404, description: '拠点が見つからない' })
  findOne(@Param('siteId') siteId: string) {
    return this.sitesService.findOne(siteId);
  }

  @Post()
  @Roles('master', 'editor')
  @ApiOperation({ summary: '拠点新規登録' })
  @ApiResponse({ status: 201, description: '登録成功' })
  create(@Body() dto: CreateSiteDto) {
    return this.sitesService.create(dto);
  }

  @Patch(':siteId')
  @Roles('master', 'editor')
  @ApiOperation({ summary: '拠点更新' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '拠点が見つからない' })
  update(@Param('siteId') siteId: string, @Body() dto: UpdateSiteDto) {
    return this.sitesService.update(siteId, dto);
  }

  @Delete(':siteId')
  @Roles('master', 'editor')
  @ApiOperation({ summary: '拠点削除（論理削除）' })
  @ApiResponse({ status: 200, description: '削除成功' })
  @ApiResponse({ status: 404, description: '拠点が見つからない' })
  remove(@Param('siteId') siteId: string) {
    return this.sitesService.remove(siteId);
  }
}
