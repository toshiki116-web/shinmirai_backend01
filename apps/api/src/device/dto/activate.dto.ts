import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ActivateDto {
  @ApiProperty({ description: 'PC端末UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('4', { message: 'pc_uuidはUUID v4形式で指定してください' })
  pcUuid!: string;
}
