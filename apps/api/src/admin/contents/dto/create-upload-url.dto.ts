import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateUploadUrlDto {
  @ApiProperty({ description: 'ファイル名', example: 'sample.mp4' })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({ description: 'MIMEタイプ', example: 'video/mp4' })
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty({ description: 'ファイルサイズ（bytes）', example: 104857600 })
  @IsInt()
  @Min(1)
  fileSize!: number;
}
