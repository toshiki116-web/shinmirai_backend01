import { DeviceService } from './device.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

const device = {
  unitId: 'UNIT-1',
  siteId: 'LOC-0001',
  unitName: 'unit',
  pcUuid: null,
  deviceToken: null,
  connectionMode: 'online',
  status: 'normal',
  licenseStatus: 'valid',
  licenseExpiredAt: null,
  site: { siteId: 'LOC-0001', siteName: 'site' },
};

describe('DeviceService activate', () => {
  function createService() {
    const prisma = {
      unit: {
        update: jest.fn().mockResolvedValue({
          unitId: 'UNIT-1',
          siteId: 'LOC-0001',
          pcUuid: '550e8400-e29b-41d4-a716-446655440000',
          deviceToken: 'device-token',
        }),
      },
    };
    const storageService = {};

    return {
      service: new DeviceService(prisma as any, storageService as any),
      prisma,
    };
  }

  it('registers only the PC UUID for the authenticated unit', async () => {
    const { service, prisma } = createService();

    const result = await service.activate(device, {
      pcUuid: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(prisma.unit.update).toHaveBeenCalledWith({
      where: { unitId: 'UNIT-1' },
      data: { pcUuid: '550e8400-e29b-41d4-a716-446655440000' },
    });
    expect(result).toEqual({
      unitId: 'UNIT-1',
      siteId: 'LOC-0001',
      pcUuid: '550e8400-e29b-41d4-a716-446655440000',
      deviceToken: 'device-token',
    });
  });

  it('rejects an already activated unit', async () => {
    const { service, prisma } = createService();

    await expect(
      service.activate(
        { ...device, pcUuid: '550e8400-e29b-41d4-a716-446655440000' },
        { pcUuid: '550e8400-e29b-41d4-a716-446655440001' },
      ),
    ).rejects.toThrow(ConflictException);
    expect(prisma.unit.update).not.toHaveBeenCalled();
  });

  it('rejects a unit without an assigned site', async () => {
    const { service, prisma } = createService();

    await expect(
      service.activate(
        { ...device, siteId: null, site: null },
        { pcUuid: '550e8400-e29b-41d4-a716-446655440000' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.unit.update).not.toHaveBeenCalled();
  });
});

describe('DeviceService getContents thumbnails', () => {
  it('returns signed thumbnail URLs only for ready thumbnails', async () => {
    const prisma = {
      content: {
        findMany: jest.fn().mockResolvedValue([
          {
            contentId: 'CNT-00001',
            contentName: 'Ready content',
            statusCategory: 'status1',
            deliveryType: 'general',
            filePath: 'contents/CNT-00001/movie.mp4',
            thumbnailPath: 'contents/CNT-00001/thumbnails/thumb.jpg',
            thumbnailStatus: 'ready',
            version: 1,
            checksum: 'abc',
          },
          {
            contentId: 'CNT-00002',
            contentName: 'No thumbnail',
            statusCategory: 'status1',
            deliveryType: 'limited',
            filePath: 'contents/CNT-00002/movie.mp4',
            thumbnailPath: null,
            thumbnailStatus: 'none',
            version: 1,
            checksum: null,
          },
        ]),
      },
    };
    const storageService = {
      signContentUrl: jest.fn((objectKey: string) => `https://cdn.example.test/${objectKey}`),
    };
    const service = new DeviceService(prisma as any, storageService as any);

    const result = await service.getContents(device);

    expect(prisma.content.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ deliveryType: true }),
      }),
    );
    expect(result.items[0].deliveryType).toBe('general');
    expect(result.items[1].deliveryType).toBe('limited');
    expect(result.items[0].thumbnailUrl).toBe(
      'https://cdn.example.test/contents/CNT-00001/thumbnails/thumb.jpg',
    );
    expect(result.items[1].thumbnailUrl).toBeNull();
  });
});

describe('DeviceService log upload completion', () => {
  function createService(overrides?: {
    expectedKey?: string;
    headLogObject?: jest.Mock;
    validateLogUpload?: jest.Mock;
  }) {
    const prisma = {
      deviceLogFile: {
        upsert: jest.fn().mockImplementation(({ create }) =>
          Promise.resolve({
            ...create,
            logFileId: 'log-file-id',
          }),
        ),
      },
    };
    const storageService = {
      validateLogFileName: jest.fn((fileName: string) => fileName),
      buildLogObjectKey: jest.fn(() => overrides?.expectedKey ?? 'logs/UNIT-1/app.log'),
      headLogObject:
        overrides?.headLogObject ??
        jest.fn().mockResolvedValue({
          fileSize: BigInt(1024),
          checksum: 'etag',
          contentType: 'text/plain',
        }),
      validateLogUpload: overrides?.validateLogUpload ?? jest.fn(),
      normalizeContentType: jest.fn((contentType: string) => contentType.split(';')[0].trim()),
      deleteLogObject: jest.fn().mockResolvedValue(undefined),
    };

    return {
      service: new DeviceService(prisma as any, storageService as any),
      prisma,
      storageService,
    };
  }

  it('rejects object keys outside the authenticated unit path before reading S3', async () => {
    const { service, storageService } = createService();

    await expect(
      service.completeLogUpload(device, {
        objectKey: 'logs/UNIT-2/app.log',
        fileName: 'app.log',
        contentType: 'text/plain',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(storageService.headLogObject).not.toHaveBeenCalled();
  });

  it('upserts verified log metadata with the S3 content type and explicit uploadedAt', async () => {
    const { service, prisma } = createService({
      headLogObject: jest.fn().mockResolvedValue({
        fileSize: BigInt(2048),
        checksum: 'etag',
        contentType: 'text/plain; charset=utf-8',
      }),
    });

    const result = await service.completeLogUpload(device, {
      objectKey: 'logs/UNIT-1/app.log',
      fileName: 'app.log',
      contentType: 'application/json',
      checksum: 'client-checksum',
    });

    expect(prisma.deviceLogFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { s3Key: 'logs/UNIT-1/app.log' },
        update: expect.objectContaining({
          contentType: 'text/plain',
          checksum: 'client-checksum',
          uploadedAt: expect.any(Date),
        }),
        create: expect.objectContaining({
          contentType: 'text/plain',
          checksum: 'client-checksum',
          uploadedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.logFileId).toBe('log-file-id');
  });
});
