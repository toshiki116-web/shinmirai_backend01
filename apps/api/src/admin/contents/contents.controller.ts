import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ContentsService } from './contents.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { ContentQueryDto } from './dto/content-query.dto';
import { AssignSitesDto } from './dto/assign-sites.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('コンテンツ管理')
@ApiBearerAuth()
@Controller('admin/contents')
export class ContentsController {
  constructor(private readonly contentsService: ContentsService) {}

  @Get()
  @ApiOperation({ summary: 'コンテンツ一覧取得', description: 'キーワード検索・状態カテゴリ・配信区分・言語で絞り込み' })
  @ApiResponse({ status: 200, description: 'コンテンツ一覧' })
  findAll(@Query() query: ContentQueryDto) {
    return this.contentsService.findAll(query);
  }

  @Get(':contentId')
  @ApiOperation({ summary: 'コンテンツ詳細取得', description: 'コンテンツ情報と配信先拠点一覧を返却' })
  @ApiResponse({ status: 200, description: 'コンテンツ詳細' })
  @ApiResponse({ status: 404, description: 'コンテンツが見つからない' })
  findOne(@Param('contentId') contentId: string) {
    return this.contentsService.findOne(contentId);
  }

  @Post()
  @Roles('master', 'editor')
  @ApiOperation({ summary: 'コンテンツ新規登録', description: 'メタデータ登録。動画ファイルは別途uploadエンドポイントで送信' })
  @ApiResponse({ status: 201, description: '登録成功' })
  create(@Body() dto: CreateContentDto) {
    return this.contentsService.create(dto);
  }

  @Post(':contentId/upload-url')
  @Roles('master', 'editor')
  @ApiOperation({ summary: '動画アップロードURL発行', description: 'S3直PUT用の署名付きURLを発行する' })
  @ApiResponse({ status: 201, description: '署名付きURL発行成功' })
  @ApiResponse({ status: 404, description: 'コンテンツが見つからない' })
  createUploadUrl(@Param('contentId') contentId: string, @Body() dto: CreateUploadUrlDto) {
    return this.contentsService.createUploadUrl(contentId, dto);
  }

  @Post(':contentId/upload-complete')
  @Roles('master', 'editor')
  @ApiOperation({ summary: '動画アップロード完了', description: 'S3の実在確認後、コンテンツのファイルメタデータを確定する' })
  @ApiResponse({ status: 201, description: 'アップロード完了処理成功' })
  @ApiResponse({ status: 400, description: 'アップロード済みファイルを確認できない' })
  @ApiResponse({ status: 404, description: 'コンテンツが見つからない' })
  completeUpload(@Param('contentId') contentId: string, @Body() dto: CompleteUploadDto) {
    return this.contentsService.completeUpload(contentId, dto);
  }

  @Patch(':contentId')
  @Roles('master', 'editor')
  @ApiOperation({ summary: 'コンテンツ更新' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: 'コンテンツが見つからない' })
  update(@Param('contentId') contentId: string, @Body() dto: UpdateContentDto) {
    return this.contentsService.update(contentId, dto);
  }

  @Delete(':contentId')
  @Roles('master', 'editor')
  @ApiOperation({ summary: 'コンテンツ削除（論理削除）' })
  @ApiResponse({ status: 200, description: '削除成功' })
  @ApiResponse({ status: 404, description: 'コンテンツが見つからない' })
  remove(@Param('contentId') contentId: string) {
    return this.contentsService.remove(contentId);
  }

  @Post(':contentId/assign')
  @Roles('master', 'editor')
  @ApiOperation({ summary: '拠点割り当て', description: '配信対象拠点を一括設定（既存の割り当てを置換）' })
  @ApiResponse({ status: 200, description: '割り当て成功' })
  @ApiResponse({ status: 404, description: 'コンテンツが見つからない' })
  assignSites(@Param('contentId') contentId: string, @Body() dto: AssignSitesDto) {
    return this.contentsService.assignSites(contentId, dto);
  }
}
