import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { ADMIN_ROLE_VALUES, AdminRoleValue } from './create-user.dto';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'メールアドレス', example: 'user@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'メールアドレスの形式が正しくありません' })
  email?: string;

  @ApiPropertyOptional({ description: '名前' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'ロール', enum: ADMIN_ROLE_VALUES })
  @IsOptional()
  @IsIn(ADMIN_ROLE_VALUES, { message: 'ロールはmaster/editor/viewerのいずれかを指定してください' })
  role?: AdminRoleValue;

  @ApiPropertyOptional({ description: '備考' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: '有効フラグ' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: '有効フラグはtrue/falseで指定してください' })
  isActive?: boolean;

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
