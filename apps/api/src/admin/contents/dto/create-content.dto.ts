import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsIn, IsArray } from 'class-validator';

export class CreateContentDto {
  @ApiProperty({ description: 'コンテンツ名', example: '臨床試験ガイダンス映像 #04' })
  @IsString()
  @IsNotEmpty({ message: 'コンテンツ名は必須です' })
  contentName!: string;

  @ApiPropertyOptional({ description: '言語', default: 'ja', example: 'ja' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: '配信区分',
    enum: ['general', 'limited'],
    default: 'general',
  })
  @IsOptional()
  @IsIn(['general', 'limited'], { message: '配信区分はgeneralまたはlimitedを指定してください' })
  deliveryType?: string;

  @ApiPropertyOptional({
    description: '状態カテゴリ',
    enum: ['status1', 'status2', 'status3'],
    default: 'status1',
  })
  @IsOptional()
  @IsString()
  statusCategory?: string;

  @ApiPropertyOptional({
    description: '配信対象拠点IDリスト',
    type: [String],
    example: ['LOC-0001', 'LOC-0002'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  siteIds?: string[];
}
