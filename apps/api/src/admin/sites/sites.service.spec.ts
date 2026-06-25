import { SitesService } from './sites.service';

describe('SitesService findAll unitCount (BUG-007)', () => {
  function createService(units: Array<{ status: string }>) {
    // 論理削除済みを除外した件数（詳細画面と一致すべき期待値）
    const activeCount = units.filter((u) => u.status !== 'deleted').length;

    const findMany = jest.fn().mockImplementation((args: any) => {
      // _count に渡されたフィルタを尊重して件数を算出する
      // （Prisma 実機と同様に、where があれば絞り込んだ件数を返す）
      const unitsSelect = args?.include?._count?.select?.units;
      const filteredCount =
        unitsSelect && typeof unitsSelect === 'object' && unitsSelect.where
          ? units.filter((u) => u.status !== 'deleted').length
          : units.length;

      return Promise.resolve([
        {
          siteId: 'LOC-0003',
          siteName: 'アーティフィス桜ノ宮',
          status: 'active',
          _count: { units: filteredCount },
        },
      ]);
    });

    const prisma = {
      site: {
        findMany,
        count: jest.fn().mockResolvedValue(1),
      },
    };

    return {
      service: new SitesService(prisma as any),
      prisma,
      findMany,
      activeCount,
    };
  }

  it('一覧の unitCount は論理削除済み筐体を除外した件数になる', async () => {
    // 全5台のうち2台が論理削除済み → 期待値は active 3台
    const { service, activeCount } = createService([
      { status: 'normal' },
      { status: 'normal' },
      { status: 'normal' },
      { status: 'deleted' },
      { status: 'deleted' },
    ]);

    const result = await service.findAll({ page: 1, limit: 20 } as any);

    expect(activeCount).toBe(3);
    expect(result.items[0].unitCount).toBe(3);
  });

  it('_count のリレーションカウントに削除済み除外フィルタが指定されている', async () => {
    const { service, findMany } = createService([{ status: 'normal' }]);

    await service.findAll({ page: 1, limit: 20 } as any);

    const args = findMany.mock.calls[0][0];
    expect(args.include._count.select.units).toEqual({
      where: { status: { not: 'deleted' } },
    });
  });
});
