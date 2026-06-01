import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class AssignSitesDto {
  @ApiProperty({
    description: '配信対象拠点IDリスト（既存の割り当てを置換）',
    type: [String],
    example: ['LOC-0001', 'LOC-0002'],
  })
  @IsArray()
  @ArrayNotEmpty({ message: '拠点IDリストは1つ以上必要です' })
  @IsString({ each: true })
  siteIds!: string[];
}
