import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateThumbnailUrlDto {
  @ApiProperty({ description: '画像ファイル名', example: 'thumbnail.jpg' })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({ description: 'MIMEタイプ', example: 'image/jpeg' })
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty({ description: 'ファイルサイズ(bytes)', example: 524288 })
  @IsInt()
  @Min(1)
  fileSize!: number;
}
