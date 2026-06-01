import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

class DeviceStatusDto {
  @ApiProperty({ description: 'デバイス名', example: 'unity_app' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'ステータス', example: 'running' })
  @IsString()
  status!: string;
}

export class HeartbeatDto {
  @ApiProperty({ description: '筐体ステータス', enum: ['normal', 'warning', 'stop', 'maintenance'] })
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiPropertyOptional({ description: '各デバイスのステータス', type: [DeviceStatusDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeviceStatusDto)
  devices?: DeviceStatusDto[];

  @ApiProperty({ description: '送信日時', example: '2026-04-06T10:10:00+09:00' })
  @IsDateString()
  sentAt!: string;
}
