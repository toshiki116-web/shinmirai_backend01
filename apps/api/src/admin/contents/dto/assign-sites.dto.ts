import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class AssignSitesDto {
  @ApiProperty({
    description: '配信対象拠点IDリスト（既存の割り当てを全置換。空配列で全解除）',
    type: [String],
    example: ['LOC-0001', 'LOC-0002'],
  })
  @IsArray()
  @ArrayUnique({ message: '拠点IDが重複しています' })
  @IsString({ each: true })
  siteIds!: string[];
}
