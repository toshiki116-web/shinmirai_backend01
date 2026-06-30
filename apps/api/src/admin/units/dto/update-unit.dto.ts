import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateUnitDto {
  @ApiPropertyOptional({ description: '所属拠点ID' })
  @IsOptional()
  @IsString()
  siteId?: string | null;

  @ApiPropertyOptional({ description: '筐体名' })
  @IsOptional()
  @IsString()
  unitName?: string;

  @ApiPropertyOptional({ description: '接続モード', enum: ['online', 'offline'] })
  @IsOptional()
  @IsIn(['online', 'offline'])
  connectionMode?: string;

  @ApiPropertyOptional({ description: '備考' })
  @IsOptional()
  @IsString()
  note?: string;
}
