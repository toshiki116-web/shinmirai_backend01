import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateUnitDto {
  @ApiPropertyOptional({ description: '所属拠点ID' })
  @IsOptional()
  @IsString()
  siteId?: string;

  @ApiPropertyOptional({ description: '筐体名' })
  @IsOptional()
  @IsString()
  unitName?: string;

  @ApiPropertyOptional({ description: 'PC端末UUID' })
  @IsOptional()
  @IsString()
  pcUuid?: string;

  @ApiPropertyOptional({ description: '接続モード', enum: ['online', 'offline'] })
  @IsOptional()
  @IsIn(['online', 'offline'])
  connectionMode?: string;

  @ApiPropertyOptional({ description: '備考' })
  @IsOptional()
  @IsString()
  note?: string;
}
