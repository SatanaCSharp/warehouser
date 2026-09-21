// T11 — `dashboards/usecases/queries/read-coverage-gap.query.ts` does not exist yet.
//
// Coverage Gap is a conjunction Panel (ADR 0001): `@RequiredPermission(ITEMS_WATCH)` admits the
// request at the guard, and `@ObservedPermission(CUSTOMER_ORDERS_WATCH, PURCHASE_DRAFTS_WATCH)`
// resolves the rest of the conjunction onto `AccessCurrentUser.observedPermissionIds`, which this
// query alone asserts before issuing any read (sad.md §6.2, §6.3). Denial must be the shared
// non-enumerating error and must precede the repository call — a query that asserts nothing looks
// identical to one that asserts and forgets to call the repository, so every denial case below also
// asserts the repository was never touched (spec.md §6 "Read shape" / AC-02's "presents no chart
// frame ... reveals nothing about ... which of the member's Permissions fell short").
import { PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { ReadCoverageGapQuery } from 'dashboards/usecases/queries/read-coverage-gap.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type {
  CoverageGapRead,
  WarehouseDemandCoverageRepository,
} from 'shared/domain/repositories/warehouse-demand-coverage.repository';
import { describe, expect, it, vi } from 'vitest';

const warehouseId = '00000000-0000-4000-8000-000000000001';

const buildCurrentUser = (
  observedPermissionIds: readonly PermissionId[],
): AccessCurrentUser => ({
  userId: '00000000-0000-4000-8000-000000000002',
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: PermissionId.ITEMS_WATCH,
  observedPermissionIds,
  archived: false,
});

const coverageGapRead: CoverageGapRead = {
  rows: [
    {
      itemId: '00000000-0000-4000-8000-000000000301',
      sku: 'SKU-1',
      totalOutstandingQuantity: 10,
      onHandQuantity: 4,
      inboundQuantity: 2,
      uncoveredQuantity: 4,
    },
  ],
  remainder: null,
};

const buildRepository = (): WarehouseDemandCoverageRepository =>
  ({
    readCoverageGap: vi.fn().mockResolvedValue(coverageGapRead),
  }) as unknown as WarehouseDemandCoverageRepository;

describe('ReadCoverageGapQuery', () => {
  it('reads the Coverage Gap when the actor holds the whole conjunction (AC-02, AC-03)', async () => {
    const repository = buildRepository();
    const query = new ReadCoverageGapQuery(repository);
    const currentUser = buildCurrentUser([
      PermissionId.CUSTOMER_ORDERS_WATCH,
      PermissionId.PURCHASE_DRAFTS_WATCH,
    ]);

    const result = await query.execute(currentUser);

    expect(result).toEqual(coverageGapRead);
    expect(repository.readCoverageGap).toHaveBeenCalledTimes(1);
    expect(repository.readCoverageGap).toHaveBeenCalledWith(warehouseId);
  });

  it('denies before any read when CUSTOMER_ORDERS:WATCH is absent from the observed set (AC-02)', async () => {
    const repository = buildRepository();
    const query = new ReadCoverageGapQuery(repository);
    const currentUser = buildCurrentUser([PermissionId.PURCHASE_DRAFTS_WATCH]);

    await expect(query.execute(currentUser)).rejects.toMatchObject({
      code: 'access.denied',
    });
    expect(repository.readCoverageGap).not.toHaveBeenCalled();
  });

  it('denies before any read when PURCHASE_DRAFTS:WATCH is absent from the observed set (AC-02)', async () => {
    const repository = buildRepository();
    const query = new ReadCoverageGapQuery(repository);
    const currentUser = buildCurrentUser([PermissionId.CUSTOMER_ORDERS_WATCH]);

    await expect(query.execute(currentUser)).rejects.toMatchObject({
      code: 'access.denied',
    });
    expect(repository.readCoverageGap).not.toHaveBeenCalled();
  });

  it('denies before any read when the observed set is empty (AC-02a — a partial holder gets a partial surface, never this Panel alone)', async () => {
    const repository = buildRepository();
    const query = new ReadCoverageGapQuery(repository);
    const currentUser = buildCurrentUser([]);

    await expect(query.execute(currentUser)).rejects.toMatchObject({
      code: 'access.denied',
    });
    expect(repository.readCoverageGap).not.toHaveBeenCalled();
  });

  it('discloses nothing about which Permission fell short (spec.md §6.1)', async () => {
    const repository = buildRepository();
    const query = new ReadCoverageGapQuery(repository);
    const currentUser = buildCurrentUser([]);

    const failure: unknown = await query
      .execute(currentUser)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApplicationError);
    expect((failure as ApplicationError).details).toBeUndefined();
  });
});
