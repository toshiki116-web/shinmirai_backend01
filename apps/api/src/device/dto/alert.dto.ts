import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class CreateAlertDto {
  @ApiProperty({ description: 'アラート種別', example: 'device_disconnected' })
  @IsString()
  @IsNotEmpty()
  alertType!: string;

  @ApiPropertyOptional({ description: 'デバイス名', example: 'heart_sensor' })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({ description: '詳細', example: 'Bluetooth disconnected' })
  @IsOptional()
  @IsString()
  detail?: string;

  @ApiProperty({ description: 'アラートレベル', enum: ['info', 'warning', 'error', 'critical'] })
  @IsString()
  @IsNotEmpty()
  level!: string;

  @ApiProperty({ description: '発生日時', example: '2026-04-06T10:12:00+09:00' })
  @IsDateString()
  occurredAt!: string;
}
