import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class SiteQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: '拠点名・拠点IDでキーワード検索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: 'ステータス絞り込み', enum: ['active', 'warning', 'stopped'] })
  @IsOptional()
  @IsString()
  status?: string;
}
