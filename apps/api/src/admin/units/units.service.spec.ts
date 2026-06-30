import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { UnitsService } from './units.service';

const baseUnit = {
  unitId: 'UNIT-1',
  siteId: 'LOC-0001',
  unitName: 'unit',
  pcUuid: 'pc-uuid',
  deviceToken: 'device-token',
  connectionMode: 'online',
  status: 'normal',
  alertMessage: null,
  licenseStatus: 'valid',
  licenseExpiredAt: null,
  lastSeenAt: null,
  lastIncidentNotifiedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('UnitsService update', () => {
  function createService(options?: {
    existing?: typeof baseUnit | (Omit<typeof baseUnit, 'siteId'> & { siteId: string | null });
    updated?: typeof baseUnit | (Omit<typeof baseUnit, 'siteId'> & { siteId: string | null });
    site?: { siteId: string; status: string };
  }) {
    const existing = options?.existing ?? baseUnit;
    const updated = options?.updated ?? existing;
    const prisma = {
      unit: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
      site: {
        findUnique: jest
          .fn()
          .mockResolvedValue(options?.site ?? { siteId: 'LOC-0002', status: 'active' }),
      },
    };

    return {
      service: new UnitsService(prisma as any, {} as any),
      prisma,
    };
  }

  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('rejects explicit null siteId without updating the unit', async () => {
    const { service, prisma } = createService();

    await expect(
      service.update('UNIT-1', { siteId: null }, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.unit.findUnique).not.toHaveBeenCalled();
    expect(prisma.unit.update).not.toHaveBeenCalled();
  });

  it('rejects changing an already assigned site before looking up the requested site', async () => {
    const { service, prisma } = createService();

    await expect(
      service.update('UNIT-1', { siteId: 'LOC-0002' }, 'admin-1'),
    ).rejects.toThrow(ConflictException);

    expect(prisma.site.findUnique).not.toHaveBeenCalled();
    expect(prisma.unit.update).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('keeps the current site when siteId is omitted', async () => {
    const { service, prisma } = createService();

    await service.update('UNIT-1', { unitName: 'renamed' }, 'admin-1');

    expect(prisma.site.findUnique).not.toHaveBeenCalled();
    expect(prisma.unit.update).toHaveBeenCalledWith({
      where: { unitId: 'UNIT-1' },
      data: {
        siteId: undefined,
        unitName: 'renamed',
        connectionMode: undefined,
      },
    });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('allows the same siteId without logging', async () => {
    const { service, prisma } = createService();

    await service.update('UNIT-1', { siteId: 'LOC-0001' }, 'admin-1');

    expect(prisma.site.findUnique).toHaveBeenCalledWith({ where: { siteId: 'LOC-0001' } });
    expect(prisma.unit.update).toHaveBeenCalledWith({
      where: { unitId: 'UNIT-1' },
      data: {
        siteId: 'LOC-0001',
        unitName: undefined,
        connectionMode: undefined,
      },
    });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('allows assigning a site once when the unit is unassigned', async () => {
    const unassigned = { ...baseUnit, siteId: null };
    const assigned = { ...baseUnit, siteId: 'LOC-0002' };
    const { service, prisma } = createService({
      existing: unassigned,
      updated: assigned,
    });

    await service.update('UNIT-1', { siteId: 'LOC-0002' }, 'admin-1');

    expect(prisma.site.findUnique).toHaveBeenCalledWith({ where: { siteId: 'LOC-0002' } });
    expect(prisma.unit.update).toHaveBeenCalledWith({
      where: { unitId: 'UNIT-1' },
      data: {
        siteId: 'LOC-0002',
        unitName: undefined,
        connectionMode: undefined,
      },
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('筐体拠点割当: who=admin-1 unit=UNIT-1 siteId=LOC-0002'),
    );
  });

  it('rejects assigning a missing site to an unassigned unit', async () => {
    const { service, prisma } = createService({
      existing: { ...baseUnit, siteId: null },
      site: { siteId: 'LOC-404', status: 'deleted' },
    });

    await expect(
      service.update('UNIT-1', { siteId: 'LOC-404' }, 'admin-1'),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.site.findUnique).toHaveBeenCalledWith({ where: { siteId: 'LOC-404' } });
    expect(prisma.unit.update).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
