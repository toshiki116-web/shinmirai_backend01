import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ description: '所属拠点ID', example: 'LOC-0001' })
  @IsString()
  @IsNotEmpty({ message: '拠点IDは必須です' })
  siteId!: string;

  @ApiProperty({ description: '筐体名', example: '1号機' })
  @IsString()
  @IsNotEmpty({ message: '筐体名は必須です' })
  unitName!: string;

  @ApiPropertyOptional({ description: 'PC端末UUID' })
  @IsOptional()
  @IsString()
  pcUuid?: string;

  @ApiPropertyOptional({
    description: '接続モード',
    enum: ['online', 'offline'],
    default: 'online',
  })
  @IsOptional()
  @IsIn(['online', 'offline'], { message: '接続モードはonlineまたはofflineを指定してください' })
  connectionMode?: string;
}
