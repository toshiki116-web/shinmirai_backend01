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

describe('ContentsService completeUpload', () => {
  const objectKey = 'contents/CNT-00001/11111111-1111-1111-1111-111111111111.mp4';

  function createService(overrides?: {
    filePath?: string | null;
    head?: { fileSize: bigint; checksum: string | null; contentType: string | null };
    validateUpload?: jest.Mock;
  }) {
    const content = {
      contentId: 'CNT-00001',
      isActive: true,
      filePath: overrides && 'filePath' in overrides ? overrides.filePath : objectKey,
      mimeType: 'video/mp4',
    };
    const prisma = {
      content: {
        findUnique: jest.fn().mockResolvedValue(content),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...content, ...data })),
      },
    };
    const storageService = {
      headObject: jest.fn().mockResolvedValue(
        overrides?.head ?? { fileSize: BigInt(1024), checksum: 'etag', contentType: 'video/mp4' },
      ),
      validateUpload: overrides?.validateUpload ?? jest.fn(),
      normalizeContentType: jest.fn((contentType: string) => contentType.split(';')[0].trim()),
      signContentUrl: jest.fn((key: string) => `https://cdn.example.test/${key}`),
    };

    return {
      service: new ContentsService(prisma as any, storageService as any),
      prisma,
      storageService,
    };
  }

  it('rejects any object key when filePath is not set, without calling headObject', async () => {
    const { service, storageService } = createService({ filePath: null });

    await expect(service.completeUpload('CNT-00001', { objectKey })).rejects.toThrow(
      BadRequestException,
    );
    expect(storageService.headObject).not.toHaveBeenCalled();
  });

  it('rejects an object key different from filePath', async () => {
    const { service, storageService } = createService();

    await expect(
      service.completeUpload('CNT-00001', { objectKey: 'contents/CNT-99999/other.mp4' }),
    ).rejects.toThrow(BadRequestException);
    expect(storageService.headObject).not.toHaveBeenCalled();
  });

  it('marks the upload failed when the uploaded object is not an allowed video', async () => {
    const validateUpload = jest.fn(() => {
      throw new BadRequestException('invalid video');
    });
    const { service, prisma, storageService } = createService({
      head: { fileSize: BigInt(1024), checksum: 'etag', contentType: 'text/html' },
      validateUpload,
    });

    await expect(service.completeUpload('CNT-00001', { objectKey })).rejects.toThrow(
      BadRequestException,
    );
    expect(storageService.validateUpload).toHaveBeenCalledWith('text/html', 1024);
    expect(prisma.content.update).toHaveBeenCalledWith({
      where: { contentId: 'CNT-00001' },
      data: { uploadStatus: 'failed' },
    });
  });

  it('marks the upload failed when the uploaded object exceeds the size limit', async () => {
    const validateUpload = jest.fn(() => {
      throw new BadRequestException('too large');
    });
    const { service, prisma, storageService } = createService({
      head: {
        fileSize: BigInt(5 * 1024 * 1024 * 1024 + 1),
        checksum: 'etag',
        contentType: 'video/mp4',
      },
      validateUpload,
    });

    await expect(service.completeUpload('CNT-00001', { objectKey })).rejects.toThrow(
      BadRequestException,
    );
    expect(storageService.validateUpload).toHaveBeenCalledWith('video/mp4', 5 * 1024 * 1024 * 1024 + 1);
    expect(prisma.content.update).toHaveBeenCalledWith({
      where: { contentId: 'CNT-00001' },
      data: { uploadStatus: 'failed' },
    });
  });

  it('marks the upload ready for a valid video and keeps filePath unchanged', async () => {
    const { service, prisma } = createService({
      head: { fileSize: BigInt(1024), checksum: 'etag', contentType: 'video/mp4; codecs=avc1' },
    });

    await service.completeUpload('CNT-00001', { objectKey });

    expect(prisma.content.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filePath: objectKey,
          mimeType: 'video/mp4',
          uploadStatus: 'ready',
        }),
      }),
    );
  });
});
