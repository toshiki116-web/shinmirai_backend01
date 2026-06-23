import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CompleteLogUploadDto {
  @ApiProperty({ description: 'S3 object key', example: 'logs/UNIT-12345678/app-20260623.log' })
  @IsString()
  @IsNotEmpty()
  objectKey!: string;

  @ApiProperty({ description: 'Log file name', example: 'app-20260623.log' })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({ description: 'MIME type sent by the device', example: 'text/plain' })
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiPropertyOptional({ description: 'Client-side checksum' })
  @IsOptional()
  @IsString()
  checksum?: string;
}
