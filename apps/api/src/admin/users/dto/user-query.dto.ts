import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ADMIN_ROLE_VALUES, AdminRoleValue } from './create-user.dto';

export class UserQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'メールアドレス・名前で検索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: 'ロール', enum: ADMIN_ROLE_VALUES })
  @IsOptional()
  @IsIn(ADMIN_ROLE_VALUES, { message: 'ロールはmaster/editor/viewerのいずれかを指定してください' })
  role?: AdminRoleValue;

  @ApiPropertyOptional({ description: '有効フラグ' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: '有効フラグはtrue/falseで指定してください' })
  isActive?: boolean;
}
