import { BadRequestException } from '@nestjs/common';
import { ContentsService } from './contents.service';

describe('ContentsService thumbnail upload', () => {
  const baseContent = {
    contentId: 'CNT-00001',
    isActive: true,
    thumbnailPath: null,
    thumbnailMimeType: null,
    thumbnailStatus: 'none',
    fileSize: null,
  };

  function createService(overrides?: {
    content?: Record<string, unknown>;
    headObject?: jest.Mock;
    validateImageUpload?: jest.Mock;
  }) {
    const prisma = {
      content: {
        findUnique: jest.fn().mockResolvedValue({ ...baseContent, ...overrides?.content }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...baseContent, ...overrides?.content, ...data }),
        ),
      },
    };
    const storageService = {
      headObject:
        overrides?.headObject ??
        jest.fn().mockResolvedValue({
          fileSize: BigInt(1024),
          checksum: 'etag',
          contentType: 'image/jpeg',
        }),
      validateImageUpload: overrides?.validateImageUpload ?? jest.fn(),
      normalizeImageContentType: jest.fn((contentType: string) => contentType.split(';')[0].trim()),
      signContentUrl: jest.fn((objectKey: string) => `https://cdn.example.test/${objectKey}`),
    };

    return {
      service: new ContentsService(prisma as any, storageService as any),
      prisma,
      storageService,
    };
  }

  it('rejects thumbnail object keys outside the content thumbnail prefix', async () => {
    const { service, storageService } = createService();

    await expect(
      service.completeThumbnailUpload('CNT-00001', {
        objectKey: 'contents/CNT-99999/thumbnails/thumb.jpg',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(storageService.headObject).not.toHaveBeenCalled();
  });

  it('marks thumbnail upload failed when the uploaded object is not an allowed image', async () => {
    const validateImageUpload = jest.fn(() => {
      throw new BadRequestException('invalid image');
    });
    const { service, prisma } = createService({
      headObject: jest.fn().mockResolvedValue({
        fileSize: BigInt(1024),
        checksum: 'etag',
        contentType: 'text/plain',
      }),
      validateImageUpload,
    });

    await expect(
      service.completeThumbnailUpload('CNT-00001', {
        objectKey: 'contents/CNT-00001/thumbnails/thumb.jpg',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.content.update).toHaveBeenCalledWith({
      where: { contentId: 'CNT-00001' },
      data: { thumbnailStatus: 'failed' },
    });
  });
});
