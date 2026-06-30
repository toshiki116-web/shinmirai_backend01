import { ApiProperty } from '@nestjs/swagger';

export class HeartbeatResponseDto {
  @ApiProperty({ example: true })
  received!: boolean;

  @ApiProperty({ nullable: true, example: 'LOC-0001' })
  siteId!: string | null;

  @ApiProperty({ nullable: true, example: '渋谷スクランブルスクエア店' })
  siteName!: string | null;
}

export class ContentItemDto {
  @ApiProperty({ example: 'CNT-00001' })
  contentId!: string;

  @ApiProperty({ example: 'Relaxation Movie Vol.1' })
  contentName!: string;

  @ApiProperty({ example: 'status1' })
  statusCategory!: string;

  @ApiProperty({ example: 'general' })
  deliveryType!: string;

  @ApiProperty({ nullable: true, example: 'https://cdn.example.test/content.mp4' })
  downloadUrl!: string | null;

  @ApiProperty({ nullable: true, example: 'https://cdn.example.test/thumbnail.jpg' })
  thumbnailUrl!: string | null;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ nullable: true, example: 'abc123' })
  checksum!: string | null;
}

export class ContentsResponseDto {
  @ApiProperty({ nullable: true, example: 'LOC-0001' })
  siteId!: string | null;

  @ApiProperty({ nullable: true, example: '渋谷スクランブルスクエア店' })
  siteName!: string | null;

  @ApiProperty({ type: [ContentItemDto] })
  items!: ContentItemDto[];
}
