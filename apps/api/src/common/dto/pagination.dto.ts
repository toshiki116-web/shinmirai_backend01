import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** ページネーション共通クエリDTO */
export class PaginationDto {
  @ApiPropertyOptional({ description: 'ページ番号', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: '1ページあたりの件数', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  /** Prismaのskip値を計算 */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
