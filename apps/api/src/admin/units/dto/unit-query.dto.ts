import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const UNIT_STATUSES = ['normal', 'warning', 'stop', 'maintenance'] as const;

export class UnitQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: '筐体ID・UUID・名称でキーワード検索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '所属拠点IDで絞り込み' })
  @IsOptional()
  @IsString()
  siteId?: string;

  @ApiPropertyOptional({ description: 'ステータス絞り込み', enum: UNIT_STATUSES })
  @IsOptional()
  @IsIn(UNIT_STATUSES)
  status?: string;
}
