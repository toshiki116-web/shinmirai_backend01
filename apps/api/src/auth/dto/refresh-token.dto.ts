import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'リフレッシュトークン' })
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}
