import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Validate } from 'class-validator';
import { PasswordPolicyConstraint } from './password-policy.validator';

export const ADMIN_ROLE_VALUES = ['master', 'editor', 'viewer'] as const;
export type AdminRoleValue = (typeof ADMIN_ROLE_VALUES)[number];

export class CreateUserDto {
  @ApiProperty({ description: 'メールアドレス', example: 'user@example.com' })
  @IsEmail({}, { message: 'メールアドレスの形式が正しくありません' })
  email!: string;

  @ApiProperty({ description: '名前', example: '山田 太郎' })
  @IsString()
  @IsNotEmpty({ message: '名前は必須です' })
  name!: string;

  @ApiProperty({ description: 'パスワード', minLength: 12 })
  @IsString()
  @Validate(PasswordPolicyConstraint)
  password!: string;

  @ApiProperty({ description: 'ロール', enum: ADMIN_ROLE_VALUES })
  @IsIn(ADMIN_ROLE_VALUES, { message: 'ロールはmaster/editor/viewerのいずれかを指定してください' })
  role!: AdminRoleValue;

  @ApiPropertyOptional({ description: '備考' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: '不具合発生時の自動メール受信可否' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: '通知フラグはtrue/falseで指定してください' })
  notifyOnIncident?: boolean;
}
