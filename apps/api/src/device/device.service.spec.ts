import { DeviceService } from './device.service';

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

    const result = await service.getContents({
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
    });

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
