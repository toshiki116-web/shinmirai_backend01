import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSiteDto {
  @ApiProperty({ description: '拠点名', example: '大阪梅田店' })
  @IsString()
  @IsNotEmpty({ message: '拠点名は必須です' })
  siteName!: string;

  @ApiPropertyOptional({ description: '住所', example: '大阪府大阪市北区梅田1-1-1' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: '電話番号', example: '06-1234-5678' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ description: '備考', example: '保守窓口あり' })
  @IsOptional()
  @IsString()
  note?: string;
}
