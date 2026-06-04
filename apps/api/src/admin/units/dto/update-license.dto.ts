import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class UpdateLicenseDto {
  @ApiProperty({
    description: 'ライセンス状態',
    enum: ['valid', 'expired', 'suspended', 'unknown'],
  })
  @IsIn(['valid', 'expired', 'suspended', 'unknown'], {
    message: 'ライセンス状態はvalid、expired、suspended、unknownのいずれかを指定してください',
  })
  licenseStatus!: string;

  @ApiPropertyOptional({ description: 'ライセンス有効期限（ISO8601）' })
  @IsOptional()
  @IsDateString({}, { message: 'ライセンス有効期限は日付形式で指定してください' })
  licenseExpiredAt?: string;
}
