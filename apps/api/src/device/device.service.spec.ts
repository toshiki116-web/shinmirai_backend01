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
  alertMessage: null,
  licenseStatus: 'valid',
  licenseExpiredAt: null,
  lastIncidentNotifiedAt: null,
  site: { siteId: 'LOC-0001', siteName: 'site' },
};

const mailService = {
  sendIncidentAlert: jest.fn().mockResolvedValue(undefined),
};

const configService = {
  get: jest.fn().mockReturnValue(undefined),
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
      service: new DeviceService(
        prisma as any,
        storageService as any,
        mailService as any,
        configService as any,
      ),
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
    const service = new DeviceService(
      prisma as any,
      storageService as any,
      mailService as any,
      configService as any,
    );

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

describe('DeviceService checkLicense (BUG-008)', () => {
  function createService() {
    return new DeviceService({} as any, {} as any, mailService as any, configService as any);
  }

  it('keeps a valid license usable even after licenseExpiredAt has passed', async () => {
    const service = createService();

    await expect(
      service.checkLicense({
        ...device,
        licenseStatus: 'valid',
        licenseExpiredAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ licenseValid: true });
  });

  it('keeps a valid license usable before licenseExpiredAt', async () => {
    const service = createService();

    await expect(
      service.checkLicense({
        ...device,
        licenseStatus: 'valid',
        licenseExpiredAt: new Date('2099-01-01T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ licenseValid: true });
  });

  it('keeps a valid license usable when licenseExpiredAt is not set', async () => {
    const service = createService();

    await expect(
      service.checkLicense({
        ...device,
        licenseStatus: 'valid',
        licenseExpiredAt: null,
      }),
    ).resolves.toMatchObject({ licenseValid: true });
  });

  it('rejects manually suspended licenses', async () => {
    const service = createService();

    await expect(
      service.checkLicense({
        ...device,
        licenseStatus: 'suspended',
        licenseExpiredAt: new Date('2099-01-01T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ licenseValid: false });
  });

  it('rejects manually expired licenses', async () => {
    const service = createService();

    await expect(
      service.checkLicense({
        ...device,
        licenseStatus: 'expired',
        licenseExpiredAt: new Date('2099-01-01T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ licenseValid: false });
  });
});

describe('DeviceService sendAlert incident notification', () => {
  const alertDto = {
    alertType: 'overheat',
    deviceName: 'sensor',
    detail: 'temperature is too high',
    level: 'error',
    occurredAt: '2026-06-29T00:00:00.000Z',
  };

  function createService(options?: {
    acquiredCount?: number;
    recipients?: { email: string }[];
    mailRejects?: boolean;
  }) {
    const prisma = {
      deviceAlert: {
        create: jest.fn().mockResolvedValue({ id: 'alert-id' }),
      },
      unit: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: options?.acquiredCount ?? 1 }),
      },
      admin: {
        findMany: jest.fn().mockResolvedValue(options?.recipients ?? [{ email: 'admin@example.com' }]),
      },
    };
    const mail = {
      sendIncidentAlert: options?.mailRejects
        ? jest.fn().mockRejectedValue(new Error('ses failed'))
        : jest.fn().mockResolvedValue(undefined),
    };
    const service = new DeviceService(
      prisma as any,
      {} as any,
      mail as any,
      configService as any,
    );

    return { service, prisma, mail };
  }

  async function flushAsyncNotifications() {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }

  it('sends mail for error alerts after acquiring the unit cooldown slot', async () => {
    const { service, prisma, mail } = createService();

    await expect(service.sendAlert(device, alertDto)).resolves.toEqual({ alertId: 'alert-id' });
    await flushAsyncNotifications();

    expect(prisma.unit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { unitId: 'UNIT-1' },
        data: expect.objectContaining({ status: 'warning' }),
      }),
    );
    expect(prisma.unit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unitId: 'UNIT-1',
          OR: expect.any(Array),
        }),
      }),
    );
    expect(prisma.admin.findMany).toHaveBeenCalledWith({
      where: { notifyOnIncident: true, isActive: true },
      select: { email: true },
    });
    expect(mail.sendIncidentAlert).toHaveBeenCalledWith(
      ['admin@example.com'],
      expect.objectContaining({
        unitId: 'UNIT-1',
        unitName: 'unit',
        alertType: 'overheat',
        level: 'error',
      }),
    );
  });

  it('does not send mail when the cooldown slot is already held', async () => {
    const { service, prisma, mail } = createService({ acquiredCount: 0 });

    await service.sendAlert(device, alertDto);
    await flushAsyncNotifications();

    expect(prisma.admin.findMany).not.toHaveBeenCalled();
    expect(mail.sendIncidentAlert).not.toHaveBeenCalled();
  });

  it('does not send mail for warning alerts', async () => {
    const { service, prisma, mail } = createService();

    await service.sendAlert(device, { ...alertDto, level: 'warning' });
    await flushAsyncNotifications();

    expect(prisma.unit.update).not.toHaveBeenCalled();
    expect(prisma.unit.updateMany).not.toHaveBeenCalled();
    expect(mail.sendIncidentAlert).not.toHaveBeenCalled();
  });

  it('keeps the alert response successful when mail sending fails', async () => {
    const { service, mail } = createService({ mailRejects: true });

    await expect(service.sendAlert(device, alertDto)).resolves.toEqual({ alertId: 'alert-id' });
    await flushAsyncNotifications();

    expect(mail.sendIncidentAlert).toHaveBeenCalled();
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
      service: new DeviceService(
        prisma as any,
        storageService as any,
        mailService as any,
        configService as any,
      ),
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
