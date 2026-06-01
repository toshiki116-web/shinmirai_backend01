import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitQueryDto } from './dto/unit-query.dto';

@ApiTags('筐体管理')
@ApiBearerAuth()
@Controller('admin/units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @ApiOperation({ summary: '筐体一覧取得', description: '全拠点横断で筐体の状態を一覧確認' })
  @ApiResponse({ status: 200, description: '筐体一覧' })
  findAll(@Query() query: UnitQueryDto) {
    return this.unitsService.findAll(query);
  }

  @Get(':unitId')
  @ApiOperation({ summary: '筐体詳細取得', description: '筐体情報・アラート履歴・直近ログを返却' })
  @ApiResponse({ status: 200, description: '筐体詳細' })
  @ApiResponse({ status: 404, description: '筐体が見つからない' })
  findOne(@Param('unitId') unitId: string) {
    return this.unitsService.findOne(unitId);
  }

  @Post()
  @ApiOperation({ summary: '筐体新規登録', description: 'device_tokenが自動生成され、作成時のレスポンスにのみ含まれる' })
  @ApiResponse({ status: 201, description: '登録成功（device_token含む）' })
  create(@Body() dto: CreateUnitDto) {
    return this.unitsService.create(dto);
  }

  @Patch(':unitId')
  @ApiOperation({ summary: '筐体更新' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '筐体が見つからない' })
  update(@Param('unitId') unitId: string, @Body() dto: UpdateUnitDto) {
    return this.unitsService.update(unitId, dto);
  }

  @Delete(':unitId')
  @ApiOperation({ summary: '筐体削除（論理削除）' })
  @ApiResponse({ status: 200, description: '削除成功' })
  @ApiResponse({ status: 404, description: '筐体が見つからない' })
  remove(@Param('unitId') unitId: string) {
    return this.unitsService.remove(unitId);
  }
}
