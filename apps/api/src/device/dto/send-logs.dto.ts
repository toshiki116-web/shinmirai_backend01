import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, ValidateNested, IsDateString, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

class LogEntryDto {
  @ApiProperty({ description: 'タイムスタンプ', example: '2026-04-06T10:00:00+09:00' })
  @IsDateString()
  timestamp!: string;

  @ApiProperty({ description: 'ログレベル', enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'] })
  @IsString()
  level!: string;

  @ApiProperty({ description: 'メッセージ', example: 'Failed to connect heart sensor' })
  @IsString()
  @IsNotEmpty()
  message!: string;
}

export class SendLogsDto {
  @ApiProperty({ description: 'ログ種別', enum: ['application', 'error', 'event'] })
  @IsString()
  @IsNotEmpty()
  logType!: string;

  @ApiProperty({ description: 'ログエントリ（最大100件）', type: [LogEntryDto] })
  @IsArray()
  @ArrayMaxSize(100, { message: 'ログは1回のリクエストで最大100件です' })
  @ValidateNested({ each: true })
  @Type(() => LogEntryDto)
  logs!: LogEntryDto[];
}
