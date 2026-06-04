import { ApiProperty } from '@nestjs/swagger';
import { IsString, Validate } from 'class-validator';
import { PasswordPolicyConstraint } from './password-policy.validator';

export class ResetPasswordDto {
  @ApiProperty({ description: '新しいパスワード', minLength: 12 })
  @IsString()
  @Validate(PasswordPolicyConstraint)
  password!: string;
}
