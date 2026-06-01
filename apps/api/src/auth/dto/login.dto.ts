import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'ログインID', example: 'admin' })
  @IsString()
  @IsNotEmpty({ message: 'ログインIDは必須です' })
  loginId!: string;

  @ApiProperty({ description: 'パスワード', example: 'changeme' })
  @IsString()
  @IsNotEmpty({ message: 'パスワードは必須です' })
  password!: string;
}
