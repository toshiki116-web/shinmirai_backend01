import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ContentQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'コンテンツ名でキーワード検索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '状態カテゴリ絞り込み' })
  @IsOptional()
  @IsString()
  statusCategory?: string;

  @ApiPropertyOptional({ description: '配信区分絞り込み', enum: ['general', 'limited'] })
  @IsOptional()
  @IsString()
  deliveryType?: string;

  @ApiPropertyOptional({ description: '言語絞り込み' })
  @IsOptional()
  @IsString()
  language?: string;
}
