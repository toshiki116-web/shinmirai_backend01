import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'メールアドレス', example: 'kushida@artifice-inc.com' })
  @IsEmail({}, { message: 'メールアドレスの形式が正しくありません' })
  @IsNotEmpty({ message: 'メールアドレスは必須です' })
  email!: string;

  @ApiProperty({ description: 'パスワード', example: 'changeme' })
  @IsString()
  @IsNotEmpty({ message: 'パスワードは必須です' })
  password!: string;
}
