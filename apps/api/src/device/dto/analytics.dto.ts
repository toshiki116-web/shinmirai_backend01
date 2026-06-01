import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, Min } from 'class-validator';

export class DailyAnalyticsDto {
  @ApiProperty({ description: '対象日', example: '2026-04-06' })
  @IsDateString()
  targetDate!: string;

  @ApiProperty({ description: '利用回数', example: 18 })
  @IsInt()
  @Min(0)
  useCount!: number;
}
