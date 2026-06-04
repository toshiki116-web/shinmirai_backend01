import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CompleteUploadDto {
  @ApiProperty({ description: 'S3オブジェクトキー', example: 'contents/CNT-00001/example.mp4' })
  @IsString()
  @IsNotEmpty()
  objectKey!: string;

  @ApiPropertyOptional({ description: 'クライアント側チェックサム（任意）' })
  @IsOptional()
  @IsString()
  checksum?: string;
}
