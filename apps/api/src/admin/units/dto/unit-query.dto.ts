import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class UnitQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: '筐体ID・UUIDでキーワード検索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '所属拠点IDで絞り込み' })
  @IsOptional()
  @IsString()
  siteId?: string;

  @ApiPropertyOptional({ description: 'ステータス絞り込み', enum: ['normal', 'warning', 'stop', 'maintenance'] })
  @IsOptional()
  @IsString()
  status?: string;
}
