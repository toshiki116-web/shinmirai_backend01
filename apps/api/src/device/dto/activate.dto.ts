import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ActivateDto {
  @ApiProperty({ description: '拠点ID', example: 'LOC-0001' })
  @IsString()
  @IsNotEmpty()
  siteId!: string;

  @ApiProperty({ description: '筐体ID', example: 'UNIT-A001' })
  @IsString()
  @IsNotEmpty()
  unitId!: string;

  @ApiProperty({ description: 'PC端末UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('4', { message: 'pc_uuidはUUID v4形式で指定してください' })
  pcUuid!: string;
}
