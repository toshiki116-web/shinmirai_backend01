import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CompleteThumbnailUploadDto {
  @ApiProperty({
    description: 'S3オブジェクトキー',
    example: 'contents/CNT-00001/thumbnails/550e8400-e29b-41d4-a716-446655440000.jpg',
  })
  @IsString()
  @IsNotEmpty()
  objectKey!: string;

  @ApiPropertyOptional({ description: 'クライアント側チェックサム(任意)' })
  @IsOptional()
  @IsString()
  checksum?: string;
}
