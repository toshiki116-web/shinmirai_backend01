import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateLogUploadUrlDto {
  @ApiProperty({ description: 'Log file name', example: 'app-20260623.log' })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({ description: 'MIME type', example: 'text/plain' })
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @ApiProperty({ description: 'File size in bytes', example: 1048576 })
  @IsInt()
  @Min(1)
  fileSize!: number;
}
